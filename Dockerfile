# Use the official Node.js runtime as the base image
FROM node:18-alpine

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code to the working directory
COPY . .

# Create uploads and logs directories with proper permissions
RUN mkdir -p uploads logs
RUN chown -R nextjs:nodejs /app/uploads /app/logs

# Switch to non-root user
USER nextjs

# Make port 3000 available to the world outside the container
EXPOSE 3000

# Define the command to run the application
CMD [ "npm", "start" ]