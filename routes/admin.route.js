const express = require('express');
const { JobModel } = require('../models/Job');
const { AuditLogModel } = require('../models/AuditLog');
const MongoQueue = require('../queue/mongo.queue');

const router = express.Router();

// GET /admin/jobs - Get all jobs with pagination
router.get('/jobs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let jobs, total;
    try {
      jobs = await JobModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      total = await JobModel.countDocuments();
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
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/job/:id - Get specific job details
router.get('/job/:id', async (req, res) => {
  try {
    let job;
    try {
      job = await JobModel.findById(req.params.id);
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
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/audit-logs - Get audit logs with pagination
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let logs, total;
    try {
      logs = await AuditLogModel.find()
        .populate('jobId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      total = await AuditLogModel.countDocuments();
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
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/stats - Get system statistics
router.get('/stats', async (req, res) => {
  try {
    let totalJobs, completedJobs, failedJobs, queuedJobs, processingJobs;
    try {
      totalJobs = await JobModel.countDocuments();
      completedJobs = await JobModel.countDocuments({ status: 'COMPLETED' });
      failedJobs = await JobModel.countDocuments({ status: 'FAILED' });
      queuedJobs = await JobModel.countDocuments({ status: 'QUEUED' });
      processingJobs = await JobModel.countDocuments({ status: 'RUNNING' });
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
    
    // Initialize MongoDB queue for stats
    const queue = new MongoQueue();
    const queueStats = await queue.getStats();
    
    res.json({
      jobs: {
        total: totalJobs,
        completed: completedJobs,
        failed: failedJobs,
        queued: queuedJobs,
        processing: processingJobs
      },
      queue: queueStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;