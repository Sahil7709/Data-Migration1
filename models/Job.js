const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  checksum: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED'],
    default: 'PENDING',
    required: true
  },
  processedRows: {
    type: Number,
    default: 0
  },
  totalRows: {
    type: Number,
    default: 0
  },
  totalChunks: {
    type: Number,
    default: 0
  },
  processedChunks: {
    type: Number,
    default: 0
  },
  filePath: {
    type: String,
    required: true
  },
  error: {
    type: String,
    default: null
  },
  lastProcessedChunk: {
    type: Number,
    default: -1
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Add indexes for efficient querying
jobSchema.index({ status: 1 });
jobSchema.index({ createdAt: -1 });

const JobModel = mongoose.model('Job', jobSchema);

module.exports = { JobModel };