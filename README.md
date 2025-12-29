# Data Migration UI

A simple UI for uploading CSV files with automatic migration triggering to MongoDB.

## Field Filtering Configuration

This tool now supports field filtering to include, exclude, rename, or transform fields during migration. See `config/field-filter.config.js` for configuration options.

To configure field filtering:

1. Copy `config/field-filter.example.js` to `config/field-filter.config.js`
2. Modify the configuration according to your needs
3. The configuration supports:
   - Including specific fields only (whitelist)
   - Excluding specific fields (blacklist)
   - Renaming fields during migration
   - Transforming field values
   - Filtering records based on custom criteria

## Features

- CSV file upload with preview
- Real-time migration progress tracking
- Job management and audit logging
- Admin dashboard for monitoring

## Prerequisites

- Node.js 16+ 
- MongoDB (local installation, Docker, or MongoDB Atlas)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up MongoDB:**
   Choose one of the following options:
   
   - **Option 1: MongoDB Atlas (Recommended)**
     - Sign up at [MongoDB Atlas](https://www.mongodb.com/atlas)
     - Create a free cluster and database user
     - Update the `MONGO_URI` in your `.env` file with your connection string
   
   - **Option 2: Local MongoDB**
     - Install MongoDB Community Server from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
     - Start MongoDB service
   
   - **Option 3: Docker**
     - Make sure Docker Desktop is running
     - Start MongoDB: `docker run -d -p 27017:27017 --name mongodb mongo:6.0`

3. **Configure environment:**
   - Copy the sample configuration from SETUP.md
   - Create a `.env` file with your MongoDB connection string

4. **Check MongoDB connection:**
   ```bash
   npm run check-mongo
   ```

## Running the Application

The application requires both a server and a worker process to function properly:

1. **Start the server:**
   ```bash
   npm run dev
   # or
   nodemon server.js
   ```

2. **In a separate terminal, start the worker:**
   ```bash
   npm run worker
   # or
   node worker.js
   ```

## Usage

1. Open your browser to `http://localhost:3000`
2. Upload a CSV file using the UI
3. Preview the data before confirming migration
4. Monitor migration progress in real-time
5. Check admin dashboard for job status and audit logs

## API Endpoints

- `POST /upload` - Upload and queue CSV files for migration
- `POST /preview` - Preview CSV file content without importing
- `GET /progress` - Server-Sent Events for real-time progress updates
- `GET /admin/jobs` - Admin endpoint for job management
- `GET /health` - Health check endpoint

## Architecture

- **Server**: Handles file uploads, API requests, and serves the UI
- **Worker**: Processes queued migration jobs and writes to MongoDB
- **Queue**: MongoDB-based job queue for processing CSV files
- **Models**: Job, Record, and AuditLog for tracking migration status

## Database Configuration

By default, the application connects to the 'DataMigration' database. You can override this by setting the MONGO_URI environment variable.

## Troubleshooting

**Common Issues:**

1. **MongoDB Connection Issues**: 
   - Ensure MongoDB is running
   - Check your connection string in `.env`
   - Refer to SETUP.md for detailed instructions

2. **Application Requires Both Server and Worker**:
   - Both processes must be running for full functionality
   - Server handles uploads and UI, worker processes jobs

3. **Worker Service Not Running**:
   - Data won't be migrated if the worker service isn't running
   - Always run both `npm run dev` and `npm run worker`

For detailed setup instructions, refer to [SETUP.md](SETUP.md).