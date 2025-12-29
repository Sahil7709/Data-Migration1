const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { JobModel } = require('./models/Job');
const { RecordModel } = require('./models/Record');
const { AuditLogModel } = require('./models/AuditLog');
const { EventEmitter } = require('events');

require('dotenv').config();
const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/csv-migration';

  if (!mongoUri) {
    console.error('MONGO_URI not defined');
    process.exit(1);
  }

  const options = {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  };

  try {
    await mongoose.connect(mongoUri, options);
    console.log('✅ Worker connected to MongoDB');
  } catch (error) {
    console.error('❌ Worker MongoDB connection error:', error.message);
    process.exit(1);
  }
}

// Progress tracking emitter
const progressEmitter = new EventEmitter();

class CSVWorker {
  constructor() {
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 3000;
    this.chunkSize = parseInt(process.env.CHUNK_SIZE) || 1000;
    this.maxConcurrency = parseInt(process.env.MAX_CONCURRENCY) || 2;
    this.queue = null;
    this.progressEmitter = progressEmitter;
  }

  async start() {
    console.log('Starting CSV migration worker with MongoDB queue...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Initialize MongoDB queue
    const MongoQueue = require('./queue/mongo.queue');
    this.queue = new MongoQueue();
    
    // Start polling for CSV migration jobs
    await this.queue.startPolling('csv-migration', async (job) => {
      const { filePath, _id: jobId } = job;
      console.log(`Processing job ${jobId} with file: ${filePath}`);
      
      // Check if file exists before processing
      if (!fs.existsSync(filePath)) {
        console.error(`File does not exist: ${filePath}`);
        
        // Log FAILED action
        await AuditLogModel.create({
          action: 'FAILED',
          jobId: jobId,
          meta: { 
            filePath,
            error: 'File does not exist',
            reason: 'File was deleted before processing or job is stale'
          }
        });
        
        // Update job status to failed
        await JobModel.findByIdAndUpdate(jobId, { 
          status: 'FAILED',
          error: 'File does not exist'
        });
        
        return { status: 'failed', jobId, error: 'File does not exist' };
      }
      
      try {
        // Log START action
        await AuditLogModel.create({
          action: 'START',
          jobId: jobId,
          meta: { filePath }
        });

        // Process the CSV file
        await this.processCSVFile(filePath, jobId);
        
        console.log(`Job ${jobId} completed successfully`);
        return { status: 'completed', jobId };
      } catch (error) {
        console.error(`Job ${jobId} failed:`, error);
        
        // Log FAILED action
        await AuditLogModel.create({
          action: 'FAILED',
          jobId: jobId,
          meta: { 
            filePath,
            error: error.message,
            stack: error.stack
          }
        });
        
        throw error;
      }
    });

    console.log('CSV migration worker started with MongoDB queue');
  }

  // Count total rows in CSV file
  async countCSVRows(filePath) {
    return new Promise((resolve, reject) => {
      let rowCount = 0;
        
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', () => {
          rowCount++;
        })
        .on('end', () => {
          resolve(rowCount);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }
    
  // Split CSV into chunks
  async splitCSVIntoChunks(filePath, chunkSize) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let currentChunk = [];
        
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          currentChunk.push(data);
            
          if (currentChunk.length >= chunkSize) {
            chunks.push([...currentChunk]);
            currentChunk = [];
          }
        })
        .on('end', () => {
          if (currentChunk.length > 0) {
            chunks.push([...currentChunk]);
          }
          resolve(chunks);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }
    
  async processCSVFile(filePath, jobId) {
    // First, count total rows to set totalRows in job
    const totalRows = await this.countCSVRows(filePath);
    await JobModel.findByIdAndUpdate(jobId, { 
      totalRows,
      status: 'RUNNING'
    });
      
    // Split CSV into chunks and process them
    const chunks = await this.splitCSVIntoChunks(filePath, this.chunkSize);
      
    // Update job with total chunks
    await JobModel.findByIdAndUpdate(jobId, { 
      totalChunks: chunks.length
    });
      
    // Process chunks in parallel with limited concurrency
    let processedRows = 0;
    const results = [];
    for (let i = 0; i < chunks.length; i += this.maxConcurrency) {
      const chunkBatch = chunks.slice(i, i + this.maxConcurrency);
        
      const promises = chunkBatch.map(async (chunk, index) => {
        const chunkIndex = i + index;
            
        // Skip if this chunk was already processed
        const jobDoc = await JobModel.findById(jobId);
        if (jobDoc.lastProcessedChunk >= chunkIndex) {
          // Update processed rows based on chunk size
          processedRows += chunk.length;
          return { processed: true, chunkIndex, skipped: true };
        }
            
        try {
          const result = await this.processChunk(chunk, jobId, chunkIndex);
            
          // Update processed rows count
          processedRows += chunk.length;
            
          // Update job progress
          await JobModel.findByIdAndUpdate(jobId, { 
            processedChunks: chunkIndex + 1,
            lastProcessedChunk: chunkIndex,
            processedRows: Math.min(totalRows, processedRows)
          });
            
          // Emit progress
          const progress = Math.min(100, Math.round((processedRows / totalRows) * 100));
          this.emitProgress(jobId, progress, `Processed ${processedRows} of ${totalRows} rows (${chunkIndex + 1}/${chunks.length} chunks)`);
            
          return result;
        } catch (error) {
          console.error(`Error processing chunk ${chunkIndex}:`, error);
          throw error;
        }
      });
        
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }
      
    // Update final progress
    await JobModel.findByIdAndUpdate(jobId, { 
      processedRows: totalRows,
      status: 'COMPLETED'
    });
      
    this.emitProgress(jobId, 100, `Completed processing ${totalRows} rows in ${chunks.length} chunks`);
  }

  async processChunk(chunk, jobId, chunkIndex) {
    if (chunk.length === 0) return { processed: true, chunkIndex, count: 0 };
    
    try {
      // Insert records in bulk with ordered: false to handle duplicates
      const result = await RecordModel.insertMany(chunk, { ordered: false });
      
      // Log INSERT action
      await AuditLogModel.create({
        action: 'INSERT',
        jobId: jobId,
        meta: { 
          chunkIndex,
          chunkSize: chunk.length,
          insertedCount: result.length
        }
      });
      
      console.log(`Inserted ${result.length} records in chunk ${chunkIndex}`);
      return { processed: true, chunkIndex, count: result.length };
    } catch (error) {
      // Handle duplicate key errors (which are expected with ordered: false)
      if (error.code === 11000) {
        console.log(`Skipped duplicate records in chunk ${chunkIndex} of ${chunk.length}`);
        
        // Log SKIP action for duplicates
        await AuditLogModel.create({
          action: 'SKIP',
          jobId: jobId,
          meta: { 
            chunkIndex,
            chunkSize: chunk.length,
            duplicateCount: 'unknown'
          }
        });
        
        return { processed: true, chunkIndex, count: chunk.length, duplicates: true };
      } else {
        console.error('Error inserting chunk:', error);
        // Log the error but don't necessarily throw - allow processing to continue
        await AuditLogModel.create({
          action: 'FAILED',
          jobId: jobId,
          meta: { 
            chunkIndex,
            chunkSize: chunk.length,
            error: error.message,
            stack: error.stack
          }
        });
        throw error; // Still throw to stop the job as it's a critical error
      }
    }
  }

  emitProgress(jobId, percentage, message) {
    const progressData = {
      type: 'progress',
      jobId,
      percentage,
      message,
      timestamp: new Date().toISOString()
    };
    
    this.progressEmitter.emit('progress', progressData);
  }

  async stop() {
    if (this.queue) {
      this.queue.stopPolling();
      console.log('CSV migration worker stopped');
    }
  }
}

// Create and start the worker
const csvWorker = new CSVWorker();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await csvWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await csvWorker.stop();
  process.exit(0);
});

csvWorker.start();

module.exports = { CSVWorker, progressEmitter };