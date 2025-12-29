const mongoose = require('mongoose');

// Record schema with strict: false to allow flexible CSV data
const recordSchema = new mongoose.Schema({}, {
  strict: false, // Allow any fields from CSV
  timestamps: true
});

// Note: For CSV data, unique indexes should be defined based on business requirements
// The insertMany({ ordered: false }) will handle duplicate errors gracefully

const RecordModel = mongoose.model('Record', recordSchema);

module.exports = { RecordModel };