const crypto = require('crypto');
const fs = require('fs');

/**
 * Calculate SHA-256 checksum of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} SHA-256 checksum as hex string
 */
async function calculateFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      const checksum = hash.digest('hex');
      resolve(checksum);
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Calculate SHA-256 checksum of a buffer
 * @param {Buffer} buffer - Buffer to calculate checksum for
 * @returns {string} SHA-256 checksum as hex string
 */
function calculateBufferChecksum(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

module.exports = {
  calculateFileChecksum,
  calculateBufferChecksum
};