# CSV to MongoDB Migration System - Deployment Guide

## Overview
This document provides comprehensive instructions for deploying the high-performance CSV to MongoDB migration system that can handle 2000+ records per second with enhanced security and monitoring.

## System Architecture
- **Frontend**: Simple HTML/JavaScript UI for CSV file uploads
- **Backend**: Node.js/Express server with optimized MongoDB connection pooling
- **Database**: MongoDB for storing migrated data
- **Logging**: Winston-based logging system with file rotation
- **Containerization**: Docker with docker-compose for easy deployment

## Performance Optimizations

### 1. MongoDB Connection Settings
- **Connection Pool**: Increased to 50 connections (maxPoolSize)
- **Compression**: Enabled zlib compression for network efficiency
- **Write Concern**: Optimized for high throughput (w:1, j:false)
- **Retry Logic**: Implemented with exponential backoff

### 2. Batch Processing
- **Batch Size**: Increased to 5000 records per batch
- **Ordered Inserts**: Disabled for better performance
- **Async Processing**: Non-blocking batch operations

### 3. Memory Efficiency
- **Streaming CSV Processing**: Memory-efficient parsing
- **Proper Cleanup**: Automatic resource management

## Security Features

### 1. File Validation
- **Content Validation**: Checks for binary content, proper CSV structure
- **CSV Injection Protection**: Prevents malicious injection patterns
- **Quote Validation**: Ensures balanced quotes to prevent injection
- **Extension Validation**: Blocks executable files

### 2. Injection Patterns Blocked
- `+`, `-`, `@`, `=` prefixes (CSV formula injection)
- JavaScript/vbscript/file protocols
- Unbalanced quotes

### 3. File Size Limits
- Configurable size limits (default: 500MB)

## Deployment Options

### Option 1: Docker Deployment (Recommended)

#### Prerequisites
- Docker Engine (v20.10+)
- Docker Compose (v2.0+)

#### Steps
1. Clone or copy the project files
2. Navigate to the project directory
3. Run the following command:

```bash
docker-compose up -d
```

4. The application will be available at `http://localhost:3000`

#### Environment Variables
The system uses the following environment variables (defined in docker-compose.yml):

- `MONGO_URI`: MongoDB connection string
- `DB_NAME`: Database name for migration
- `COLLECTION_NAME`: Target collection name
- `BATCH_SIZE`: Number of records per batch (default: 5000)
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (production/development)

#### Volumes
- `uploads`: Persistent storage for uploaded CSV files
- `logs`: Persistent storage for application logs
- `mongo_data`: Persistent storage for MongoDB data

### Option 2: Direct Node.js Deployment

#### Prerequisites
- Node.js 18+
- MongoDB 5.0+
- npm or yarn package manager

#### Steps
1. Install dependencies:
```bash
npm install
```

2. Create environment file (.env) with required variables:
```bash
MONGO_URI=mongodb://localhost:27017/csv_migration
DB_NAME=csv_migration_db
COLLECTION_NAME=csv_data
BATCH_SIZE=5000
PORT=3000
```

3. Start the application:
```bash
npm start
```

## Configuration Tuning

### Performance Tuning
For different throughput requirements, adjust these parameters:

- **BATCH_SIZE**: Higher values (5000-10000) for better throughput, lower values for memory efficiency
- **maxPoolSize**: Increase for higher concurrency (typically 20-100)
- **Connection limits**: Adjust based on your MongoDB server capacity

### Security Tuning
- **MAX_FILE_SIZE**: Adjust based on your requirements (default: 500MB)
- **File validation**: Modify `isValidCSV` function for custom validation rules

## Monitoring and Logging

### Log Files Location
- `logs/combined.log`: All application logs
- `logs/error.log`: Error logs only
- `logs/migration-combined.log`: Migration-specific logs
- `logs/migration-error.log`: Migration-specific errors

### Log Rotation
- Maximum file size: 5MB
- Maximum number of files: 5
- Automatic rotation when size limit is reached

### Key Metrics to Monitor
- Records per second throughput
- Batch processing times
- Memory usage
- MongoDB connection pool usage
- Error rates

## Production Considerations

### 1. Infrastructure
- Use dedicated MongoDB instance with sufficient RAM
- Consider MongoDB Atlas for cloud deployment
- Ensure network connectivity between app and database
- Monitor disk space for uploads and logs

### 2. Security
- Use strong MongoDB authentication
- Implement network security (firewalls, VPN)
- Regular security updates for base images
- Monitor for suspicious file uploads

### 3. Scaling
- Horizontal scaling: Multiple app instances behind load balancer
- Vertical scaling: Increase container resources
- Database scaling: MongoDB sharding for large datasets

### 4. Backup Strategy
- Regular MongoDB backups
- Log file backups
- Application configuration backups

## Troubleshooting

### Common Issues

1. **Slow Migration Performance**
   - Check MongoDB connection pool settings
   - Verify network connectivity between app and DB
   - Monitor system resources (CPU, memory, disk I/O)

2. **Memory Issues**
   - Reduce batch size
   - Monitor Node.js heap usage
   - Check for memory leaks

3. **Connection Issues**
   - Verify MongoDB URI
   - Check network connectivity
   - Confirm authentication credentials

4. **File Upload Issues**
   - Check file size limits
   - Verify upload directory permissions
   - Validate file content

### Debugging Commands

For Docker deployments:
```bash
# View application logs
docker-compose logs app

# View MongoDB logs
docker-compose logs mongo

# Execute commands inside container
docker-compose exec app sh

# Monitor resource usage
docker stats
```

## Maintenance

### Log Management
- Regular log rotation monitoring
- Archive old logs
- Monitor disk space usage

### Database Maintenance
- Regular MongoDB backups
- Index optimization
- Performance monitoring

### Application Updates
- Test updates in staging environment
- Monitor performance after updates
- Verify security after updates

## Health Checks

The Docker deployment includes health checks:
- Application: HTTP endpoint check
- Database: MongoDB ping command

## Support and Monitoring

### Key Performance Indicators
- Average throughput (records/second)
- Error rate
- Batch processing time
- Memory usage
- Response time

### Alerting
Configure monitoring for:
- Application downtime
- Database connection failures
- High error rates
- Resource exhaustion

---

## Contact and Support

For issues with the deployment:
1. Check logs first
2. Verify configuration
3. Test connectivity
4. Review system resources