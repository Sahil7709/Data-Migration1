const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JobModel } = require('../models/Job');

const router = express.Router();

/* =======================
   MULTER CONFIG
======================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

/* =======================
   HELPER: CHECKSUM
======================= */

function getChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', d => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/* =======================
   POST /upload
======================= */

router.post('/', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    // ✅ 1. Calculate checksum
    const checksum = await getChecksum(filePath);

    // ✅ 2. Prevent duplicate uploads
    let exists;
    try {
      exists = await JobModel.findOne({ checksum });
    } catch (dbError) {
      // Handle database connection errors
      if (dbError.name === 'MongooseServerSelectionError' || dbError.name === 'MongooseError') {
        fs.unlinkSync(filePath);
        return res.status(503).json({ 
          error: 'Database connection unavailable',
          message: 'Please ensure MongoDB is running and the worker service is operational'
        });
      }
      throw dbError; // Re-throw other errors
    }
    if (exists) {
      fs.unlinkSync(filePath);
      return res.status(409).json({ error: 'File already uploaded' });
    }

    // ✅ 3. Create job WITH REQUIRED FIELDS
    let job;
    try {
      job = await JobModel.create({
        filename: req.file.filename, // ✅ EXACT field name
        checksum: checksum,           // ✅ REQUIRED
        status: 'PENDING',
        processedRows: 0,
        totalRows: 0,
        filePath: filePath // Add the filePath field which is required in the schema
      });
    } catch (dbError) {
      // Handle database connection errors
      if (dbError.name === 'MongooseServerSelectionError' || dbError.name === 'MongooseError') {
        fs.unlinkSync(filePath);
        return res.status(503).json({ 
          error: 'Database connection unavailable',
          message: 'Please ensure MongoDB is running and the worker service is operational'
        });
      }
      throw dbError; // Re-throw other errors
    }

    res.json({
      success: true,
      jobId: job._id,
      message: 'File uploaded successfully, migration started'
    });

  } catch (err) {
    console.error('Upload error:', err);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
