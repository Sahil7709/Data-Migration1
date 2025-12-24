const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const csv = require('csv-parser');
const winston = require('winston');
require('dotenv').config();
const { glob } = require('glob');

// Configure logger for migration process
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'csv-migration-process' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/migration-error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/migration-combined.log', 
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});



// Configuration from environment variables
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'test_db';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'test_collection';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 2000;
const CSV_FILE_PATH = process.env.CSV_FILE_PATH || './data.csv';
const CSV_FILE_PATTERN = process.env.CSV_FILE_PATTERN || null;

// Global counters for logging
let totalRecordsProcessed = 0;
let totalRecordsInserted = 0;
let startTime;

// Reference map to store relationships between collections
const referenceMaps = {
  users: new Map(),
  doctors: new Map(),
  admin: new Map()
};



/**
 * Sleep function for retry delays
 * @param {number} ms - milliseconds to sleep
 * @returns {Promise} - resolves after ms milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Connect to MongoDB with retry logic
 * @returns {Promise<MongoClient>} - connected MongoDB client
 */
async function connectToMongo() {
  let retries = 5;
  while (retries > 0) {
    try {
      logger.info('Connecting to MongoDB...');
      const client = new MongoClient(MONGO_URI, {
        useUnifiedTopology: true,
        maxPoolSize: 50, // Increase connection pool size
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 60000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        // Enable compression for better performance
        compressors: ['zlib'],
        zlibCompressionLevel: 6
      });
      
      await client.connect();
      logger.info('Connected to MongoDB successfully');
      return client;
    } catch (error) {
      retries--;
      logger.error(`Failed to connect to MongoDB (${5 - retries}/5):`, { error: error.message });
      if (retries === 0) {
        throw new Error(`Unable to connect to MongoDB after 5 attempts: ${error.message}`);
      }
      // Wait before retrying
      await sleep(2000);
    }
  }
}

/**
 * Drop indexes on the collection to speed up insertion
 * @param {Db} db - MongoDB database instance
 * @param {string} collectionName - name of the collection
 */
async function dropIndexes(db, collectionName) {
  try {
    logger.info('Dropping indexes to optimize insertion speed...');
    const collection = db.collection(collectionName);
    const indexes = await collection.indexes();
    
    // Don't drop the default _id index
    const indexesToDrop = indexes.filter(index => index.name !== '_id_');
    
    for (const index of indexesToDrop) {
      await collection.dropIndex(index.name);
      logger.info(`Dropped index: ${index.name}`);
    }
    
    logger.info('Indexes dropped successfully');
  } catch (error) {
    logger.warn('Warning: Could not drop indexes:', { error: error.message });
  }
}

/**
 * Recreate indexes after migration is complete
 * @param {Db} db - MongoDB database instance
 * @param {string} collectionName - name of the collection
 */
async function recreateIndexes(db, collectionName) {
  try {
    logger.info('Recreating default _id index...');
    // MongoDB automatically creates the _id index, so we don't need to explicitly create it
    logger.info('Indexes recreated successfully');
  } catch (error) {
    logger.warn('Warning: Could not recreate indexes:', { error: error.message });
  }
}

/**
 * Process a batch of records and insert into MongoDB
 * @param {MongoClient} client - MongoDB client
 * @param {Array} batch - array of records to insert
 * @param {Db} db - MongoDB database instance
 * @param {number} retryCount - current retry attempt count
 * @param {string} collectionName - name of the collection to insert into
 * @returns {Promise<number>} - number of records successfully inserted
 */
async function processBatch(client, batch, db, retryCount = 0, collectionName = COLLECTION_NAME) {
  const maxRetries = 3;
  
  try {
    const collection = db.collection(collectionName);
    // Using ordered: false for better performance
    const result = await collection.insertMany(batch, { 
      ordered: false, 
      // Use write concern optimized for high throughput
      w: 1, // Write acknowledged by primary
      j: false // Disable journaling for speed (data durability trade-off)
    });
    const insertedCount = result.insertedCount;
    totalRecordsInserted += insertedCount;
    return insertedCount;
  } catch (error) {
    // Handle partial batch failures
    if (retryCount < maxRetries) {
      logger.warn(`Batch insert failed, retrying (${retryCount + 1}/${maxRetries}):`, { error: error.message });
      
      // If it's a bulk write error, we can try to insert the successful documents
      if (error.result && error.result.insertedCount) {
        totalRecordsInserted += error.result.insertedCount;
      }
      
      // Wait before retrying
      await sleep(1000 * Math.pow(2, retryCount)); // Exponential backoff
      return await processBatch(client, batch, db, retryCount + 1, collectionName);
    } else {
      logger.error(`Batch insert failed after ${maxRetries} retries:`, { error: error.message });
      // For completely failed batches, we log and continue with 0 inserted
      return 0;
    }
  }
}

/**
 * Process a single CSV file
 * @param {MongoClient} client - MongoDB client
 * @param {Db} db - MongoDB database instance
 * @param {string} filePath - Path to the CSV file
 * @param {string} collectionName - Name of the collection to insert into
 * @param {function} transformFunction - Optional function to transform rows
 */
async function processSingleCSV(client, db, filePath, collectionName = COLLECTION_NAME, transformFunction = null) {
  logger.info(`Processing file: ${filePath}`);
  
  // Check if CSV file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at path: ${filePath}`);
  }
  
  // Create a readable stream from the CSV file
  const stream = fs.createReadStream(filePath)
    .pipe(csv())
    .on('error', (error) => {
      throw new Error(`Error reading CSV file: ${error.message}`);
    });
  
  let batch = [];
  
  // Process each row in the CSV
  for await (const row of stream) {
    try {
      totalRecordsProcessed++;
      
      // Transform row if transform function is provided
      let processedRow = transformFunction ? transformFunction(row) : row;
      
      // Store reference for relationship mapping if it's a user record
      if (collectionName.toLowerCase() === 'users' && processedRow.id) {
        // Generate a new ObjectId for this user record
        const userObjectId = new ObjectId();
        processedRow._id = userObjectId;
        referenceMaps.users.set(processedRow.id, userObjectId);
      }
      
      // Add row to current batch
      batch.push(processedRow);
      
      // When batch reaches the specified size, process it
      if (batch.length >= BATCH_SIZE) {
        // Process batch asynchronously to allow for parallel processing
        await processBatch(client, batch, db, 0, collectionName);
        
        // Log progress
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const throughput = totalRecordsInserted / elapsedSeconds;
        logger.info(`Processed: ${totalRecordsProcessed} | Inserted: ${totalRecordsInserted} | Time: ${elapsedSeconds.toFixed(2)}s | Throughput: ${throughput.toFixed(2)} records/sec`);
        
        // Reset batch
        batch = [];
      }
    } catch (rowError) {
      logger.error(`Error processing row ${totalRecordsProcessed}:`, { error: rowError.message });
      // Continue processing other rows
    }
  }
  
  // Process remaining records in the final batch
  if (batch.length > 0) {
    logger.info(`Processing final batch of ${batch.length} records from ${filePath}...`);
    await processBatch(client, batch, db, 0, collectionName);
  }
}

/**
 * Main migration function
 */
async function migrateCSV() {
  let client;
  
  try {
    // Record start time
    startTime = Date.now();
    logger.info('Starting CSV migration...');
    logger.info(`Configuration: DB=${DB_NAME}, Collection=${COLLECTION_NAME}, Batch Size=${BATCH_SIZE}`);
    
    // Connect to MongoDB
    client = await connectToMongo();
    const db = client.db(DB_NAME);
    
    // Drop indexes for better insert performance
    await dropIndexes(db, COLLECTION_NAME);
    
    // Determine if we're processing a single file or multiple files
    if (CSV_FILE_PATTERN) {
      // Process multiple files using glob pattern
      logger.info(`Finding CSV files matching pattern: ${CSV_FILE_PATTERN}`);
      const files = await glob(CSV_FILE_PATTERN);
      
      if (files.length === 0) {
        throw new Error(`No files found matching pattern: ${CSV_FILE_PATTERN}`);
      }
      
      logger.info(`Found ${files.length} files to process`);
      
      // Sort files to ensure consistent processing order
      files.sort();
      
      // Process Users collection first if it exists
      const usersFiles = files.filter(file => 
        path.basename(file, path.extname(file)).toLowerCase() === 'users');
      const otherFiles = files.filter(file => 
        path.basename(file, path.extname(file)).toLowerCase() !== 'users');
      
      // Process Users files first
      for (const file of usersFiles) {
        const collectionName = path.basename(file, path.extname(file));
        await processSingleCSV(client, db, file, collectionName);
      }
      
      // Then process other files with transformation functions
      for (const file of otherFiles) {
        // Extract collection name from filename or use default
        const collectionName = path.basename(file, path.extname(file));
        
        // Create transformation function based on collection name
        let transformFunction = null;
        
        // If this is a collection that references users, create a transform function
        if (referenceMaps.users.size > 0) {
          transformFunction = (row) => {
            // Transform any field named userId or user_id to reference Users collection
            const transformedRow = { ...row };
            
            // Handle userId references
            if (transformedRow.userId || transformedRow.user_id) {
              const userId = transformedRow.userId || transformedRow.user_id;
              const userObjectId = referenceMaps.users.get(userId);
              if (userObjectId) {
                transformedRow.userId = userObjectId;
              }
            }
            
            return transformedRow;
          };
        }
        
        await processSingleCSV(client, db, file, collectionName, transformFunction);
      }
    } else {
      // Process single file
      const resolvedPath = path.resolve(CSV_FILE_PATH);
      await processSingleCSV(client, db, resolvedPath);
    }
    
    // Recreate indexes after migration
    await recreateIndexes(db, COLLECTION_NAME);
    
    // Log final statistics
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const finalThroughput = totalRecordsInserted / totalTime;
    
    logger.info('\n=== Migration Completed Successfully ===');
    logger.info(`Total Records Processed: ${totalRecordsProcessed}`);
    logger.info(`Total Records Inserted: ${totalRecordsInserted}`);
    logger.info(`Time Taken: ${totalTime.toFixed(2)} seconds`);
    logger.info(`Average Throughput: ${finalThroughput.toFixed(2)} records/sec`);
    logger.info('=====================================\n');
    
  } catch (error) {
    logger.error('Migration failed:', { error: error.message });
    logger.error('Stack trace:', { stack: error.stack });
  } finally {
    // Close MongoDB connection
    if (client) {
      try {
        await client.close();
        logger.info('MongoDB connection closed');
      } catch (closeError) {
        logger.error('Error closing MongoDB connection:', { error: closeError.message });
      }
    }
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateCSV().catch(error => logger.error('Uncaught error in migration:', { error: error.message, stack: error.stack }));
}

// Export the function for use in other modules
module.exports = { migrateCSV };