FROM node:18-alpine

# Install Python 3, pip, and Pillow dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    libjpeg-turbo-dev \
    zlib-dev && \
    pip3 install --no-cache-dir pillow

# Set working directory
WORKDIR /app

# Copy Node.js dependencies and install
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
