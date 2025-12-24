const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'csv-migration' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({ 
      filename: 'logs/combined.log', 
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Ensure logs directory exists
const logsDir = 'logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Enable CORS for all routes
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create uploads directory if it doesn't exist
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to accept only CSV files (using extension only, not MIME)
const fileFilter = (req, file, cb) => {
  // Accept files with .csv extension only
  if (file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed!'), false);
  }
};

// Initialize Multer with storage and file filter
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 500 // 500MB limit
  },
  fileFilter: fileFilter
});

// Function to validate CSV content with enhanced security
function isValidCSV(filePath) {
  try {
    // Read first 4KB of file to validate content
    const sample = fs.readFileSync(filePath, 'utf8').slice(0, 4096);
    
    // Reject binary files
    if (sample.includes('\u0000')) return false;
    
    // Check for potential CSV injection patterns
    const injectionPatterns = [/^([\+\-@=])/m, /(javascript:|vbscript:|file:\/\/)/i];
    for (const pattern of injectionPatterns) {
      if (pattern.test(sample)) {
        console.error('Potential CSV injection detected');
        return false;
      }
    }
    
    // Check for basic CSV structure - must have commas and newlines
    const lines = sample.split('\n');
    if (lines.length < 2) return false; // Need at least header + 1 data row
    
    // Basic check: should contain comma-separated values
    const hasCSVStructure = lines.slice(0, 5).some(line => line.includes(','));
    if (!hasCSVStructure) return false;
    
    // Check for balanced quotes to prevent injection
    const quoteCount = (sample.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      console.error('Unbalanced quotes detected in CSV');
      return false;
    }
    
    // Additional check: ensure it's not a script or executable content
    const dangerousExtensions = /\.(exe|bat|com|cmd|sh|php|jsp|asp|html|js|vbs)$/i;
    if (dangerousExtensions.test(filePath)) return false;
    
    return true;
  } catch (error) {
    logger.error('Error validating CSV file:', { error: error.message });
    return false;
  }
}

// Function to trigger the migration process
function triggerMigration(filePath) {
  console.log(`Triggering migration for file: ${filePath}`);
  
  // Use the local migration script
  const migrateScriptPath = path.join(__dirname, 'migrate', 'migrate.js');
  
  // Set environment variables for the migration
  const env = {
    ...process.env,
    CSV_FILE_PATH: filePath, // Use the uploaded file
    // You can also set other environment variables as needed
  };
  
  // Execute the migration script
  const migrationProcess = spawn('node', [migrateScriptPath], {
    env: env,
    stdio: 'pipe'
  });
  
  migrationProcess.stdout.on('data', (data) => {
    logger.info(`Migration stdout: ${data}`);
  });
  
  migrationProcess.stderr.on('data', (data) => {
    logger.error(`Migration stderr: ${data}`);
  });
  
  migrationProcess.on('close', (code) => {
    logger.info(`Migration process exited with code ${code}`);
  });
  
  return migrationProcess;
}

// Route to handle CSV file upload
app.post('/upload', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Validate file type by extension
  const allowedExtensions = ['.csv'];
  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    // Delete the uploaded file if it's not a CSV
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only CSV files are allowed!' });
  }

  // Validate CSV content to prevent malicious files
  if (!isValidCSV(req.file.path)) {
    // Delete the uploaded file if it's not a valid CSV
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid CSV file' });
  }

  logger.info(`File uploaded: ${req.file.originalname}`);
  logger.info(`File path: ${req.file.path}`);
  logger.info(`File size: ${req.file.size} bytes`);

  // Send success response
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    path: req.file.path
  });

  // Trigger migration for the uploaded file
  setTimeout(() => {
    triggerMigration(req.file.path);
  }, 500); // Small delay to ensure response is sent before starting migration
});

// Error handling middleware for Multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Upload endpoint: http://localhost:${PORT}/upload`);
});