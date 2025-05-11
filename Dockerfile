# Use Node base image with Debian base
FROM node:18-slim

# Install Python 3 and pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    pip3 install --no-cache-dir pillow && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy the full app
COPY . .

# Create necessary folders
RUN mkdir -p static uploads scripts public

# Expose port for Easypanel
EXPOSE 8081

# Start the app
CMD ["node", "app.js"]
