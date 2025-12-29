/**
 * Field Filter Configuration for CSV Migration
 * 
 * This configuration allows you to specify which fields from the CSV should be included
 * or excluded during the migration process.
 */

module.exports = {
  "includeFields": [
    "Education",
    "JoiningYear",
    "City",
    "PaymentTier",
    "Age",
    "Gender",
    "EverBenched"
  ],
  "excludeFields": [],
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
