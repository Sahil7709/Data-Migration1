const express = require('express');
const progressTracker = require('../progress');
const { JobModel } = require('../models/Job');
const { EventEmitter } = require('events');

const router = express.Router();

// GET /progress - Server-Sent Events endpoint for progress updates
router.get('/', async (req, res) => {
  // Add client to SSE connection
  progressTracker.addClient(res);
  
  // Send initial connection message
  const initialMessage = {
    type: 'connected',
    message: 'Connected to progress updates',
    timestamp: new Date().toISOString()
  };
  
  progressTracker.emitProgress(initialMessage);
});

// Additional endpoint to get current job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    try {
      const job = await JobModel.findById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
    } catch (dbError) {
      // Handle database connection errors
      if (dbError.name === 'MongooseServerSelectionError' || dbError.name === 'MongooseError') {
        return res.status(503).json({ 
          error: 'Database connection unavailable',
          message: 'Please ensure MongoDB is running and the worker service is operational'
        });
      }
      throw dbError; // Re-throw other errors
    }
    
    res.json({
      jobId: job._id,
      status: job.status,
      processedRows: job.processedRows,
      totalRows: job.totalRows,
      filename: job.filename,
      createdAt: job.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;