const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Current configuration state (in production, this might be stored in a database)
let currentConfig = null;

// Load the current configuration from file
async function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'field-filter.config.js');
    // Delete from require cache to get fresh config
    delete require.cache[require.resolve('../config/field-filter.config')];
    currentConfig = require('../config/field-filter.config');
    return currentConfig;
  } catch (error) {
    console.error('Error loading config:', error);
    // Return default config if file doesn't exist
    currentConfig = {
      includeFields: [],
      excludeFields: [],
      renameFields: {},
      transformFields: {},
      recordFilter: null, // Will be handled specially
      missingFieldHandling: {
        includeEmptyValues: true,
        defaultValue: null
      },
      requiredFields: [],
      failOnMissingRequiredFields: false
    };
    return currentConfig;
  }
}

// Save configuration to file
async function saveConfig(newConfig) {
  try {
    // We need to handle functions specially since they can't be JSON.stringified
    // For now, we'll create a template config and set recordFilter to null
    // The actual function logic will be handled in the util
    const configForFile = { ...newConfig };
    
    // Don't save functions to the file, they'll be handled in the utility
    if (configForFile.recordFilter) {
      configForFile.recordFilter = null;
    }
    
    // Convert the configuration object to valid JavaScript
    const configContent = `/**
 * Field Filter Configuration for CSV Migration
 * 
 * This configuration allows you to specify which fields from the CSV should be included
 * or excluded during the migration process.
 */

module.exports = ${JSON.stringify(configForFile, null, 2)};
`;

    const configPath = path.join(__dirname, '..', 'config', 'field-filter.config.js');
    await fs.writeFile(configPath, configContent);
    
    // Update the in-memory config
    currentConfig = newConfig;
    
    return { success: true, message: 'Configuration saved successfully' };
  } catch (error) {
    console.error('Error saving config:', error);
    return { success: false, error: error.message };
  }
}

// GET /config - Get current configuration
router.get('/', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /config - Update configuration
router.post('/', async (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate the configuration structure
    if (!newConfig) {
      return res.status(400).json({ success: false, error: 'Configuration is required' });
    }
    
    // Ensure required fields exist
    const validatedConfig = {
      includeFields: Array.isArray(newConfig.includeFields) ? newConfig.includeFields : [],
      excludeFields: Array.isArray(newConfig.excludeFields) ? newConfig.excludeFields : [],
      renameFields: typeof newConfig.renameFields === 'object' ? newConfig.renameFields : {},
      transformFields: typeof newConfig.transformFields === 'object' ? newConfig.transformFields : {},
      recordFilter: newConfig.recordFilter || null,
      missingFieldHandling: newConfig.missingFieldHandling || {
        includeEmptyValues: true,
        defaultValue: null
      },
      requiredFields: Array.isArray(newConfig.requiredFields) ? newConfig.requiredFields : [],
      failOnMissingRequiredFields: typeof newConfig.failOnMissingRequiredFields === 'boolean' ? 
                                   newConfig.failOnMissingRequiredFields : false
    };
    
    const result = await saveConfig(validatedConfig);
    
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /config/reset - Reset to default configuration
router.post('/reset', async (req, res) => {
  try {
    const defaultConfig = {
      includeFields: [],
      excludeFields: [],
      renameFields: {},
      transformFields: {},
      recordFilter: null,
      missingFieldHandling: {
        includeEmptyValues: true,
        defaultValue: null
      },
      requiredFields: [],
      failOnMissingRequiredFields: false
    };
    
    const result = await saveConfig(defaultConfig);
    
    if (result.success) {
      res.json({ success: true, message: 'Configuration reset to default' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;