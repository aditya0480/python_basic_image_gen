const express = require('express');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const morgan = require('morgan');

// Create Express app
const app = express();
const PORT = process.env.PORT || 8081;

// Create necessary directories
const staticDir = path.join(__dirname, 'static');
const uploadsDir = path.join(__dirname, 'uploads');
const scriptsDir = path.join(__dirname, 'scripts');
const publicDir = path.join(__dirname, 'public');

[staticDir, uploadsDir, scriptsDir, publicDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Write the Python script to the scripts directory
const pythonScript = path.join(scriptsDir, 'generate_image.py');
fs.writeFileSync(pythonScript, `
from PIL import Image, ImageDraw, ImageFont
import os
import sys
import json
import base64
from io import BytesIO

# Parse input arguments
input_json = sys.argv[1]
output_path = sys.argv[2]

# Parse JSON input
data = json.loads(input_json)
text = data.get('text', '')
width = data.get('width', 1080)
height = data.get('height', 360)
font_size = data.get('font_size', 50)
bg_color = tuple(data.get('bg_color', [0, 0, 0]))
text_color = tuple(data.get('text_color', [255, 255, 255]))

# Font path
current_dir = os.getcwd()
font_dir = 'static'
font_filename = 'NotoSansDevanagari.ttf'
font_path = os.path.join(current_dir, font_dir, font_filename)

# Create image
image = Image.new("RGB", (width, height), bg_color)
draw = ImageDraw.Draw(image)

# Try loading custom font
font = None
if os.path.exists(font_path):
    try:
        font = ImageFont.truetype(font_path, size=font_size)
        print(f"Successfully loaded custom font: {font_path}")
    except Exception as e:
        print(f"Failed to load custom font: {e}")

# If custom font not available, try system fonts
if font is None:
    system_fonts = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
    ]
    for path in system_fonts:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, size=font_size)
                print(f"Successfully loaded system font: {path}")
                break
            except Exception as e:
                print(f"Failed to load system font {path}: {e}")

# If no font was loaded, use default
if font is None:
    print("Warning: Could not load any specified font, using default")
    font = ImageFont.load_default()
    font_size = 18

# Text formatting
line_spacing = int(font_size * 0.5)  # Proportional line spacing

# Split text into lines
lines = text.split("\\n")

# Calculate total text height for vertical centering
total_text_height = 0
line_bboxes = []

for line in lines:
    bbox = draw.textbbox((0, 0), line, font=font)
    line_height = bbox[3] - bbox[1]
    line_bboxes.append((bbox, line_height))
    total_text_height += line_height + line_spacing

total_text_height -= line_spacing  # Remove extra spacing from last line

# Starting Y position for vertical centering
start_y = (height - total_text_height) // 2

# Draw each line, centered horizontally
current_y = start_y
for i, (line, (bbox, line_height)) in enumerate(zip(lines, line_bboxes)):
    text_width = bbox[2] - bbox[0]
    text_x = (width - text_width) // 2  # Center horizontally
    draw.text((text_x, current_y), line, font=font, fill=text_color)
    current_y += line_height + line_spacing

# Save the image
image.save(output_path)
print(f"Image saved as {output_path}")

# Return image data as base64 for API response
buffered = BytesIO()
image.save(buffered, format="PNG")
img_base64 = base64.b64encode(buffered.getvalue()).decode()
print(img_base64)
`);

// Configure middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev')); // Logging
app.use('/static', express.static(staticDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'font') {
      cb(null, path.join(staticDir, 'fonts'));
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    if (file.fieldname === 'font') {
      cb(null, 'custom-font.ttf');
    } else {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }
});
const upload = multer({ storage });

// Create fonts directory
const fontsDir = path.join(staticDir, 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// Font upload endpoint
app.post('/api/upload-font', upload.single('font'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No font file uploaded' });
  }
  res.json({ 
    success: true, 
    message: 'Font uploaded successfully',
    fontPath: '/static/fonts/custom-font.ttf'
  });
});

// Create the HTML file
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Text to Image Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
        }
        form {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        label {
            font-weight: bold;
        }
        textarea, input, select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        textarea {
            min-height: 120px;
            resize: vertical;
        }
        .form-row {
            display: flex;
            gap: 15px;
        }
        .form-group {
            flex: 1;
        }
        button {
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 12px 20px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
            margin: 4px 2px;
            cursor: pointer;
            border-radius: 4px;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #45a049;
        }
        .result-container {
            margin-top: 20px;
            text-align: center;
            display: none;
        }
        img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            margin-bottom: 10px;
        }
        .buttons {
            display: flex;
            justify-content: space-between;
        }
        .loading {
            display: none;
            text-align: center;
            margin: 20px 0;
        }
        .spinner {
            border: 4px solid rgba(0, 0, 0, 0.1);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border-left-color: #4CAF50;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .api-info {
            margin-top: 30px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 4px;
        }
        pre {
            background-color: #f4f4f4;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Text to Image Generator</h1>
        
        <form id="imageForm">
            <div class="form-group">
                <label for="text">Text:</label>
                <textarea id="text" name="text" required>kaash tum maut hote ek din ate zarur,
Afsos, ki tum zindagi ho,
chor kar jaogi zarur.</textarea>
            </div>
            
            <div class="form-group">
                <label for="fontFile">Upload Custom Font (TTF):</label>
                <input type="file" id="fontFile" name="font" accept=".ttf" onchange="uploadFont(this)">
                <p class="font-status" id="fontStatus"></p>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="width">Width:</label>
                    <input type="number" id="width" name="width" value="1080" min="100" max="2000" required>
                </div>
                <div class="form-group">
                    <label for="height">Height:</label>
                    <input type="number" id="height" name="height" value="360" min="100" max="2000" required>
                </div>
                <div class="form-group">
                    <label for="font_size">Font Size:</label>
                    <input type="number" id="font_size" name="font_size" value="50" min="10" max="100" required>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="bg_color">Background Color:</label>
                    <input type="color" id="bg_color" name="bg_color" value="#000000">
                </div>
                <div class="form-group">
                    <label for="text_color">Text Color:</label>
                    <input type="color" id="text_color" name="text_color" value="#FFFFFF">
                </div>
            </div>
            
            <button type="submit">Generate Image</button>
        </form>
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Generating image...</p>
        </div>
        
        <div class="result-container" id="resultContainer">
            <h2>Generated Image</h2>
            <img id="generatedImage" src="" alt="Generated text image">
            <div class="buttons">
                <button id="downloadBtn">Download Image</button>
                <button id="newImageBtn">Create New Image</button>
            </div>
        </div>
        
        <div class="api-info">
            <h2>API Usage</h2>
            <p>This image generator can be used via our API endpoint:</p>
            <pre>POST /api/generate</pre>
            <p>Example request:</p>
            <pre>
fetch('/api/generate', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        text: "Your text here\\nSecond line",
        width: 1080,
        height: 360,
        font_size: 50,
        bg_color: [0, 0, 0],  // RGB values
        text_color: [255, 255, 255]  // RGB values
    })
})
.then(response => response.json())
.then(data => {
    // data.image_url - URL to access the image
    // data.image_base64 - Base64 encoded image for immediate use
    console.log(data);
});</pre>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('imageForm');
            const loading = document.getElementById('loading');
            const resultContainer = document.getElementById('resultContainer');
            const generatedImage = document.getElementById('generatedImage');
            const downloadBtn = document.getElementById('downloadBtn');
            const newImageBtn = document.getElementById('newImageBtn');
            const fontStatus = document.getElementById('fontStatus');
            
            // Font upload function
            window.uploadFont = function(input) {
                if (input.files && input.files[0]) {
                    const formData = new FormData();
                    formData.append('font', input.files[0]);
                    
                    fontStatus.textContent = 'Uploading font...';
                    fontStatus.style.color = '#666';
                    
                    fetch('/api/upload-font', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            fontStatus.textContent = 'Font uploaded successfully!';
                            fontStatus.style.color = '#4CAF50';
                        } else {
                            fontStatus.textContent = 'Error uploading font: ' + data.error;
                            fontStatus.style.color = '#f44336';
                        }
                    })
                    .catch(error => {
                        fontStatus.textContent = 'Error uploading font: ' + error;
                        fontStatus.style.color = '#f44336';
                    });
                }
            };
            
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                
                // Show loading spinner
                loading.style.display = 'block';
                resultContainer.style.display = 'none';
                
                // Convert color inputs to RGB arrays
                const bgColor = hexToRgb(document.getElementById('bg_color').value);
                const textColor = hexToRgb(document.getElementById('text_color').value);
                
                // Prepare request data
                const requestData = {
                    text: document.getElementById('text').value,
                    width: parseInt(document.getElementById('width').value),
                    height: parseInt(document.getElementById('height').value),
                    font_size: parseInt(document.getElementById('font_size').value),
                    bg_color: [bgColor.r, bgColor.g, bgColor.b],
                    text_color: [textColor.r, textColor.g, textColor.b]
                };
                
                // Send request to server
                fetch('/api/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Set image source to the base64 data for immediate display
                        generatedImage.src = data.image_base64;
                        
                        // Hide loading spinner and show result
                        loading.style.display = 'none';
                        resultContainer.style.display = 'block';
                        
                        // Set download button URL
                        downloadBtn.setAttribute('data-url', data.image_url);
                    } else {
                        alert('Error generating image: ' + (data.details || data.error));
                        loading.style.display = 'none';
                    }
                })
                .catch(error => {
                    alert('Error: ' + error);
                    loading.style.display = 'none';
                });
            });
            
            // Download button
            downloadBtn.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'generated-image.png';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            });
            
            // New image button
            newImageBtn.addEventListener('click', function() {
                resultContainer.style.display = 'none';
                window.scrollTo(0, 0);
            });
            
            // Helper function to convert hex color to RGB
            function hexToRgb(hex) {
                const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : { r: 0, g: 0, b: 0 };
            }
        });
    </script>
</body>
</html>
`;

// Write the HTML file
fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// API endpoint for image generation
app.post('/api/generate', (req, res) => {
  try {
    const imageData = req.body;
    const timestamp = Date.now();
    const outputPath = path.join(staticDir, `generated-${timestamp}.png`);
    
    // Convert the request body to a JSON string to pass to Python
    const inputJSON = JSON.stringify(imageData);
    
    // Spawn Python process
    const pythonProcess = spawn('python3', [pythonScript, inputJSON, outputPath]);
    
    let pythonData = '';
    let pythonError = '';
    
    pythonProcess.stdout.on('data', (data) => {
      pythonData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      pythonError += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(pythonError);
        return res.status(500).json({ 
          success: false, 
          error: 'Error generating image',
          details: pythonError
        });
      }
      
      // Extract base64 from Python output (last line)
      const outputLines = pythonData.trim().split('\n');
      const base64Image = outputLines[outputLines.length - 1];
      
      // Return success response with image details
      res.json({
        success: true,
        image_url: `/static/generated-${timestamp}.png`,
        image_base64: `data:image/png;base64,${base64Image}`,
        timestamp: timestamp
      });
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
