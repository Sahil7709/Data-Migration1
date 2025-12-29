/**
 * Field Filter Utility
 * 
 * Applies field filtering configuration to CSV records during migration
 */

let fieldFilterConfig = null;

// Function to reload the configuration
function reloadConfig() {
  // Delete from require cache to get fresh config
  delete require.cache[require.resolve('../config/field-filter.config')];
  fieldFilterConfig = require('../config/field-filter.config');
  
  // If recordFilter is null or not a function, set a default function
  if (!fieldFilterConfig.recordFilter || typeof fieldFilterConfig.recordFilter !== 'function') {
    fieldFilterConfig.recordFilter = () => true; // Default: allow all records
  }
  
  return fieldFilterConfig;
}

// Load the initial configuration
reloadConfig();

// If recordFilter is null or not a function, set a default function
if (!fieldFilterConfig.recordFilter || typeof fieldFilterConfig.recordFilter !== 'function') {
  fieldFilterConfig.recordFilter = () => true; // Default: allow all records
}

/**
 * Applies field filtering to a single CSV record
 * @param {Object} record - The CSV record to filter
 * @returns {Object|null} - The filtered record or null if it should be excluded
 */
let lastConfigLoadTime = Date.now();
const CONFIG_REFRESH_INTERVAL = 5000; // Refresh config every 5 seconds

function applyFieldFilter(record) {
  // Reload config if enough time has passed
  const now = Date.now();
  if (now - lastConfigLoadTime > CONFIG_REFRESH_INTERVAL) {
    reloadConfig();
    lastConfigLoadTime = now;
  }
  
  // Apply record-level filter first
  if (fieldFilterConfig.recordFilter && typeof fieldFilterConfig.recordFilter === 'function') {
    if (!fieldFilterConfig.recordFilter(record)) {
      return null; // Skip this record entirely
    }
  }
  // If recordFilter is null/undefined, we'll allow all records by default

  let filteredRecord = { ...record };

  // Check for required fields if configured
  if (fieldFilterConfig.failOnMissingRequiredFields && fieldFilterConfig.requiredFields.length > 0) {
    const missingRequiredFields = fieldFilterConfig.requiredFields.filter(field => 
      !filteredRecord.hasOwnProperty(field) || filteredRecord[field] === null || filteredRecord[field] === undefined || filteredRecord[field] === ''
    );

    if (missingRequiredFields.length > 0) {
      throw new Error(`Missing required fields: ${missingRequiredFields.join(', ')}`);
    }
  }

  // Apply field renaming
  Object.entries(fieldFilterConfig.renameFields).forEach(([oldName, newName]) => {
    if (filteredRecord.hasOwnProperty(oldName)) {
      filteredRecord[newName] = filteredRecord[oldName];
      delete filteredRecord[oldName];
    }
  });

  // Apply field transformations
  Object.entries(fieldFilterConfig.transformFields).forEach(([fieldName, transformFn]) => {
    if (filteredRecord.hasOwnProperty(fieldName)) {
      filteredRecord[fieldName] = transformFn(filteredRecord[fieldName]);
    }
  });

  // Apply include/exclude field filtering
  const result = {};
  
  // If includeFields is specified and not empty, only include those fields
  if (fieldFilterConfig.includeFields && fieldFilterConfig.includeFields.length > 0) {
    fieldFilterConfig.includeFields.forEach(field => {
      if (filteredRecord.hasOwnProperty(field)) {
        if (fieldFilterConfig.missingFieldHandling.includeEmptyValues || 
            filteredRecord[field] !== null && 
            filteredRecord[field] !== undefined && 
            filteredRecord[field] !== '') {
          result[field] = filteredRecord[field];
        } else if (fieldFilterConfig.missingFieldHandling.defaultValue !== null) {
          result[field] = fieldFilterConfig.missingFieldHandling.defaultValue;
        }
      } else if (fieldFilterConfig.missingFieldHandling.defaultValue !== null) {
        result[field] = fieldFilterConfig.missingFieldHandling.defaultValue;
      }
    });
  } else {
    // If no includeFields specified, process all fields
    Object.keys(filteredRecord).forEach(field => {
      // Check if field should be excluded
      if (fieldFilterConfig.excludeFields && !fieldFilterConfig.excludeFields.includes(field)) {
        if (fieldFilterConfig.missingFieldHandling.includeEmptyValues || 
            filteredRecord[field] !== null && 
            filteredRecord[field] !== undefined && 
            filteredRecord[field] !== '') {
          result[field] = filteredRecord[field];
        } else if (fieldFilterConfig.missingFieldHandling.defaultValue !== null) {
          result[field] = fieldFilterConfig.missingFieldHandling.defaultValue;
        }
      }
    });
  }

  return result;
}

/**
 * Applies field filtering to an array of CSV records
 * @param {Array} records - Array of CSV records to filter
 * @returns {Array} - Array of filtered records
 */
function applyFieldFilterToRecords(records) {
  // Reload config to ensure we have the latest configuration
  const now = Date.now();
  if (now - lastConfigLoadTime > CONFIG_REFRESH_INTERVAL) {
    reloadConfig();
    lastConfigLoadTime = now;
  }
  
  return records
    .map(record => applyFieldFilter(record))
    .filter(record => record !== null); // Remove records that were filtered out
}

module.exports = {
  applyFieldFilter,
  applyFieldFilterToRecords
};