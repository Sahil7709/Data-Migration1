const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { JobModel } = require('../models/Job');
const { AuditLogModel } = require('../models/AuditLog');
const { calculateFileChecksum } = require('../utils/checksum');
const MongoQueue = require('../queue/mongo.queue');

class ScheduledImport {
  constructor() {
    this.schedule = process.env.CRON_SCHEDULE || '0 2 * * *'; // Default to 2 AM daily
    this.importDirectory = process.env.SCHEDULED_IMPORT_DIR || './scheduled_imports';
    this.task = null;
  }

  start() {
    console.log(`Starting scheduled import with schedule: ${this.schedule}`);
    
    // Create import directory if it doesn't exist
    if (!fs.existsSync(this.importDirectory)) {
      fs.mkdirSync(this.importDirectory, { recursive: true });
    }
    
    // Schedule the import task
    this.task = cron.schedule(this.schedule, async () => {
      console.log('Running scheduled import task...');
      await this.processScheduledImports();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC'
    });
    
    console.log('Scheduled import task started');
  }

  async processScheduledImports() {
    try {
      // Get all CSV files from the scheduled import directory
      const files = fs.readdirSync(this.importDirectory).filter(file => 
        path.extname(file).toLowerCase() === '.csv'
      );
      
      if (files.length === 0) {
        console.log('No CSV files found for scheduled import');
        return;
      }
      
      console.log(`Found ${files.length} CSV files for scheduled import`);
      
      for (const file of files) {
        const filePath = path.join(this.importDirectory, file);
        
        try {
          // Calculate checksum to check for duplicates
          const checksum = await calculateFileChecksum(filePath);
          
          // Check if a job with this checksum already exists
          const existingJob = await JobModel.findOne({ checksum });
          if (existingJob) {
            console.log(`Duplicate file detected for scheduled import: ${file}`);
            continue;
          }
          
          // Create a new job record
          const job = await JobModel.create({
            filename: file,
            checksum: checksum,
            status: 'QUEUED',
            processedRows: 0,
            totalRows: 0
          });
          
          // Log SCHEDULED action
          await AuditLogModel.create({
            action: 'SCHEDULED',
            jobId: job._id,
            meta: { 
              filename: file,
              checksum,
              filePath,
              scheduled: true
            }
          });
          
          // Initialize MongoDB queue and add job
          const queue = new MongoQueue();
          await queue.add('csv-migration', {
            filePath,
            _id: job._id.toString()
          });
          
          console.log(`Scheduled import job created for: ${file}`);
          
          // Move the file to processed directory to avoid re-processing
          const processedDir = path.join(this.importDirectory, 'processed');
          if (!fs.existsSync(processedDir)) {
            fs.mkdirSync(processedDir, { recursive: true });
          }
          
          const processedPath = path.join(processedDir, `${Date.now()}_${file}`);
          fs.renameSync(filePath, processedPath);
          
        } catch (error) {
          console.error(`Error processing scheduled file ${file}:`, error);
          
          // Log error
          await AuditLogModel.create({
            action: 'SCHEDULED_ERROR',
            jobId: null,
            meta: { 
              filename: file,
              error: error.message,
              stack: error.stack
            }
          });
        }
      }
    } catch (error) {
      console.error('Error in scheduled import processing:', error);
      
      // Log system error
      await AuditLogModel.create({
        action: 'SCHEDULED_SYSTEM_ERROR',
        jobId: null,
        meta: { 
          error: error.message,
          stack: error.stack
        }
      });
    }
  }

  stop() {
    if (this.task) {
      this.task.stop();
      console.log('Scheduled import task stopped');
    }
  }
}

// Create and export the scheduled import instance
const scheduledImport = new ScheduledImport();
module.exports = scheduledImport;