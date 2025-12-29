/**
 * Field Filter Configuration for CSV Migration
 * 
 * This configuration allows you to specify which fields from the CSV should be included
 * or excluded during the migration process.
 */

module.exports = {
  "includeFields": [],
  "excludeFields": [
    "Index",
    "First Name",
    "Last Name",
    "Company",
    "City",
    "Phone 1"
  ],
  "renameFields": {},
  "transformFields": {},
  "recordFilter": null,
  "missingFieldHandling": {
    "includeEmptyValues": true,
    "defaultValue": null
  },
  "requiredFields": [],
  "failOnMissingRequiredFields": false
};
