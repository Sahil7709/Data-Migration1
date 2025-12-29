const express = require('express');
const csv = require('csv-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const router = express.Router();

/* =======================
   MULTER CONFIG
======================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `preview-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

/* =======================
   POST /preview
======================= */

router.post('/', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file provided' });
  }

  const filePath = req.file.path;
  const results = [];
  const MAX_ROWS = 10; // Show fewer rows for faster preview

  try {
    // Read only the first part of the file for preview
    const fileStream = fs.createReadStream(filePath, { start: 0, end: 10240 }); // Read first 10KB
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNumber = 0;
    let headers = [];
    
    for await (const line of rl) {
      if (lineNumber === 0) {
        // Parse headers from first line
        headers = parseCSVLine(line);
      } else {
        // Parse data row
        const values = parseCSVLine(line);
        
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          results.push(row);
          
          if (results.length >= MAX_ROWS) {
            break; // Stop after collecting enough preview rows
          }
        }
      }
      lineNumber++;
      
      // Stop if we've read enough lines
      if (lineNumber > MAX_ROWS + 5) { // +5 to account for headers and some buffer
        break;
      }
    }
    
    // Function to parse a CSV line, handling quoted values
    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
            // Double quotes inside quoted field
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // End of field
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      // Add last field
      result.push(current.trim());
      return result;
    }
    
    cleanup();
    
    res.json({
      success: true,
      rows: results,
      count: results.length
    });
    
  } catch (error) {
    cleanup();
    console.error('Preview error:', error);
    res.status(500).json({ error: error.message });
  }

  function cleanup() {
    // Safe cleanup
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
});

module.exports = router;
