const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['UPLOAD', 'START', 'INSERT', 'SKIP', 'COMPLETE', 'FAILED', 'RETRY', 'SCHEDULED', 'SCHEDULED_ERROR', 'SCHEDULED_SYSTEM_ERROR']
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null
  },
  meta: {
    type: mongoose.Schema.Types.Mixed, // Flexible object for additional metadata
    default: {}
  }
}, {
  timestamps: true
});

const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);

module.exports = { AuditLogModel };