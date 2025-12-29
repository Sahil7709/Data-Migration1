const { JobModel } = require('./models/Job');
const { EventEmitter } = require('events');
const { progressEmitter: workerProgressEmitter } = require('./worker');

class ProgressTracker {
  constructor() {
    this.clients = new Set();
    this.progressEmitter = new EventEmitter();
    
    // Connect worker progress emitter to broadcast to clients
    workerProgressEmitter.on('progress', (data) => {
      this.emitProgress(data);
    });
  }

  // Add a client to the SSE connection
  addClient(res) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    this.clients.add(res);

    // Remove client when connection closes
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  // Emit progress to all connected clients
  emitProgress(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    for (const client of this.clients) {
      if (!client.destroyed) {
        client.write(message);
      }
    }
  }

  // Get the emitter for external use
  getEmitter() {
    return this.progressEmitter;
  }
  
  // Poll job progress and broadcast updates
  async startPolling() {
    const poll = async () => {
      try {
        // Get running jobs
        const jobs = await JobModel.find({ status: { $in: ['RUNNING', 'PENDING'] } });
        
        for (const job of jobs) {
          const progress = job.totalRows > 0 
            ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))
            : 0;
          
          const progressData = {
            jobId: job._id,
            percentage: progress,
            message: `Processed ${job.processedRows} of ${job.totalRows} rows`,
            status: job.status,
            timestamp: new Date().toISOString()
          };
          
          this.emitProgress(progressData);
        }
      } catch (error) {
        // Only log MongoDB-related errors if they're not connection issues
        if (error.name === 'MongooseServerSelectionError' || error.name === 'MongooseError') {
          // Connection error - don't flood logs
          // console.error('Database connection issue during progress polling:', error.message);
        } else {
          console.error('Error polling job progress:', error);
        }
      }
      
      // Schedule next poll
      setTimeout(poll, 5000); // Poll every 5 seconds
    };
    
    // Start polling
    setTimeout(poll, 0);
  }
}

const progressTracker = new ProgressTracker();
module.exports = progressTracker;