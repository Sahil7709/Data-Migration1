const express = require('express');
require('dotenv').config();
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const progressTracker = require('./progress');
const scheduledImport = require('./cron/import.cron');

// Import routes
const previewRoute = require('./routes/preview.route');
const uploadRoute = require('./routes/upload.route');
const progressRoute = require('./routes/progress.route');
const adminRoute = require('./routes/admin.route');
const configRoute = require('./routes/config.route');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'ui')));

// Routes
app.use('/preview', previewRoute);
app.use('/upload', uploadRoute);
app.use('/progress', progressRoute);
app.use('/admin', adminRoute);
app.use('/config', configRoute);

// Root route - serve the UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});



// Connect to MongoDB
async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/DataMigration';
  
  // MongoDB connection options for better reliability
  const options = {
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    maxPoolSize: 10, // Maintain up to 10 socket connections
  };
  
  try {
    await mongoose.connect(mongoUri, options);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.error('Make sure MongoDB is running. Check SETUP.md for instructions.');
    process.exit(1);
  }
}

// Start the server
async function startServer() {
  await connectDB();
  
  // Start scheduled import if enabled
  if (process.env.ENABLE_SCHEDULED_IMPORTS !== 'false') {
    scheduledImport.start();
  }
  
  // Start progress polling
  progressTracker.startPolling();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Upload endpoint: POST /upload`);
    console.log(`Preview endpoint: POST /preview`);
    console.log(`Progress endpoint: GET /progress`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  if (process.env.ENABLE_SCHEDULED_IMPORTS !== 'false') {
    scheduledImport.stop();
  }
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  if (process.env.ENABLE_SCHEDULED_IMPORTS !== 'false') {
    scheduledImport.stop();
  }
  await mongoose.disconnect();
  process.exit(0);
});

startServer().catch(console.error);

module.exports = app;