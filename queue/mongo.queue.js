const { JobModel } = require('../models/Job');
const { AuditLogModel } = require('../models/AuditLog');

class MongoQueue {
  constructor() {
    this.processing = new Set(); // Track currently processing jobs
    this.pollInterval = parseInt(process.env.QUEUE_POLL_INTERVAL) || 5000; // 5 seconds
    this.maxRetries = parseInt(process.env.QUEUE_MAX_RETRIES) || 3;
    this.polling = false;
  }

  // Add a job to the queue
  async add(queueName, jobData) {
    const job = await JobModel.create({
      ...jobData,
      status: 'PENDING'
    });

    // Log the job creation
    await AuditLogModel.create({
      action: 'UPLOAD',
      jobId: job._id,
      meta: { queueName, jobData }
    });

    return { id: job._id, ...job._doc };
  }

  // Get next available job
  async getNextJob(queueName) {
    // Find jobs that are PENDING or have failed and need retry
    const job = await JobModel.findOne({
      status: { $in: ['PENDING', 'RUNNING'] },
      retryCount: { $lt: this.maxRetries }
    }).sort({ createdAt: 1 }).exec();

    if (job) {
      // Mark as running to prevent other workers from picking it up
      const updatedJob = await JobModel.findOneAndUpdate(
        { _id: job._id, status: { $in: ['PENDING', 'RUNNING'] } },
        { 
          status: 'RUNNING',
          startedAt: job.status === 'PENDING' ? new Date() : job.startedAt
        },
        { new: true }
      );

      if (updatedJob) {
        this.processing.add(updatedJob._id.toString());
        
        // Log job started
        await AuditLogModel.create({
          action: 'START',
          jobId: updatedJob._id,
          meta: { queueName }
        });
        
        return updatedJob;
      }
    }

    return null;
  }

  // Complete a job
  async completeJob(jobId, result = null) {
    const job = await JobModel.findByIdAndUpdate(
      jobId,
      { 
        status: 'COMPLETED', 
        completedAt: new Date()
      },
      { new: true }
    );

    if (job) {
      this.processing.delete(jobId.toString());
      
      // Log job completion
      await AuditLogModel.create({
        action: 'COMPLETE',
        jobId: job._id,
        meta: { result }
      });
    }
  }

  // Fail a job
  async failJob(jobId, error) {
    const job = await JobModel.findById(jobId);
    if (!job) return;

    let newStatus = 'FAILED';
    let newRetryCount = job.retryCount;

    // Check if we should retry
    if (job.retryCount < this.maxRetries) {
      newRetryCount = job.retryCount + 1;
      newStatus = 'PENDING'; // Reset to pending for retry
      
      // Log retry
      await AuditLogModel.create({
        action: 'RETRY',
        jobId: job._id,
        meta: { 
          retryCount: newRetryCount,
          error: error.message || error,
          maxRetries: this.maxRetries
        }
      });
    } else {
      // Max retries reached, mark as failed
      await AuditLogModel.create({
        action: 'FAILED',
        jobId: job._id,
        meta: { 
          error: error.message || error,
          retryCount: job.retryCount
        }
      });
    }

    const updatedJob = await JobModel.findByIdAndUpdate(
      jobId,
      {
        status: newStatus,
        error: error.message || error,
        retryCount: newRetryCount
      },
      { new: true }
    );

    this.processing.delete(jobId.toString());
    return updatedJob;
  }

  // Start polling for jobs
  async startPolling(queueName, processFunction) {
    if (this.polling) {
      console.log('Queue polling already running');
      return;
    }

    this.polling = true;
    console.log(`Starting queue polling for ${queueName}...`);

    const poll = async () => {
      if (!this.polling) return;

      try {
        const job = await this.getNextJob(queueName);
        if (job) {
          console.log(`Processing job ${job._id} from ${queueName}`);
          
          try {
            // Process the job
            const result = await processFunction(job);
            await this.completeJob(job._id, result);
            console.log(`Job ${job._id} completed successfully`);
          } catch (error) {
            console.error(`Job ${job._id} failed:`, error);
            await this.failJob(job._id, error);
          }
        }
      } catch (error) {
        console.error('Error polling for jobs:', error);
      }

      // Schedule next poll
      setTimeout(poll, this.pollInterval);
    };

    // Start the polling loop
    setTimeout(poll, 0);
  }

  // Stop polling
  stopPolling() {
    this.polling = false;
    console.log('Queue polling stopped');
  }

  // Get queue statistics
  async getStats() {
    const stats = await JobModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsObj = {};
    stats.forEach(stat => {
      statsObj[stat._id] = stat.count;
    });

    return {
      waiting: statsObj.PENDING || 0,
      active: statsObj.RUNNING || 0,
      completed: statsObj.COMPLETED || 0,
      failed: statsObj.FAILED || 0,
      paused: statsObj.PAUSED || 0,
      total: Object.values(statsObj).reduce((sum, count) => sum + count, 0)
    };
  }
}

module.exports = MongoQueue;