/**
 * Example Field Filter Configuration for CSV Migration
 * 
 * This is an example configuration showing different ways to use the field filtering system.
 * Copy this file to field-filter.config.js and modify according to your needs.
 */

module.exports = {
  // Whitelist approach: Only these fields will be migrated (empty array = all fields)
  includeFields: [
    // 'id',
    // 'name',
    // 'email',
    // 'phone',
    // 'address',
    // 'city',
    // 'country'
  ],

  // Blacklist approach: These fields will be excluded from migration (empty array = no exclusions)
  excludeFields: [
    // 'internal_id',      // Remove internal tracking fields
    // 'temp_field',       // Remove temporary fields
    // 'calculated_value', // Remove calculated fields that can be regenerated
    // 'password',         // Remove sensitive fields
    // 'ssn'               // Remove sensitive personal information
  ],

  // Field renaming: Map old field names to new field names
  renameFields: {
    // 'old_customer_id': 'customerId',
    // 'first_name': 'firstName',
    // 'last_name': 'lastName',
    // 'e_mail': 'email',
    // 'ph_number': 'phone'
  },

  // Field transformation: Apply functions to transform field values
  transformFields: {
    // Transform email to lowercase
    'email': (value) => value ? value.toLowerCase().trim() : value,
    
    // Clean phone numbers by removing non-numeric characters (except +)
    'phone': (value) => value ? value.replace(/[^0-9+]/g, '') : value,
    
    // Convert date strings to ISO format
    'date': (value) => {
      if (!value) return value;
      try {
        return new Date(value).toISOString();
      } catch (e) {
        console.warn(`Invalid date: ${value}`);
        return value;
      }
    },
    
    // Normalize boolean-like values
    'active': (value) => {
      if (typeof value === 'string') {
        return ['true', '1', 'yes', 'y', 'active'].includes(value.toLowerCase());
      }
      return Boolean(value);
    }
  },

  // Advanced filtering: Custom function to determine if a record should be included
  recordFilter: (record) => {
    // Example: Only include records where 'status' field is 'active' or 'pending'
    // return ['active', 'pending'].includes((record.status || '').toLowerCase());
    
    // Example: Only include records with valid email
    // if (record.email) {
    //   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    //   return emailRegex.test(record.email);
    // }
    
    // Include all records by default
    return true;
  },

  // Options for handling missing fields
  missingFieldHandling: {
    // Whether to include fields with null/undefined/empty values
    includeEmptyValues: false, // Set to false to exclude empty values
    
    // Default value to use for missing fields (null means keep original value)
    defaultValue: null // Use null for missing fields, or set a default like '' or 0
  },

  // Whether to validate required fields exist
  requiredFields: [
    // 'id',    // Example: require an ID field
    // 'email'  // Example: require an email field
  ],

  // Whether to stop migration if required fields are missing
  failOnMissingRequiredFields: false
};