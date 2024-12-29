const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const path = require('path');
const Grid = require('gridfs-stream');
const crypto = require('crypto');
const { GridFsStorage } = require('multer-gridfs-storage');
const XLSX = require('xlsx');
var cors = require('cors')

const excelDataSchema = new mongoose.Schema({
    data: Object
}, { strict: false });

const ExcelData = mongoose.model('ExcelData', excelDataSchema);

const app = express();
app.use(cors({
  origin: [
      'http://localhost:3000',
      'https://file-upload-meas.vercel.app',
      'https://file-upload-brown.vercel.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
const PORT = process.env.PORT || 5000;
// MongoDB connection
const mongoURI = process.env.MONGODB_URI;
let gfs;
let upload;

// Initialize MongoDB connection and GridFS
const initializeStorage = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected successfully');

    const conn = mongoose.connection;
    // Wait for the database connection to be ready
    await new Promise(resolve => conn.once('open', resolve));
    
    gfs = new mongoose.mongo.GridFSBucket(conn.db, {
      bucketName: 'excel-upload'
    });

    const storage = new GridFsStorage({
      url: mongoURI,
      file: (req, file) => {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(16, (err, buf) => {
            if (err) return reject(err);
            const filename = buf.toString('hex') + path.extname(file.originalname);
            resolve({
              filename: filename,
              bucketName: 'excel-upload'
            });
          });
        });
      }
    });

    upload = multer({ storage });
    
    // Start server only after connection is established
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize connection
initializeStorage();

// Add better error handling in your upload route
app.post("/upload", upload.single("file"), async (req, res) => {
  console.log("Upload endpoint hit");
  try {
    if (!req.file) {
      console.log("No file received");
      return res.status(400).json({ error: "No file uploaded" });
    }
    console.log("File received:", req.file.filename);

    // Get the file buffer from GridFS
    const file = await gfs.find({ filename: req.file.filename }).toArray();
    if (!file.length) {
      console.log("File not found in GridFS");
      return res.status(404).json({ error: "File not found after upload" });
    }
    console.log("File found in GridFS");

    try {
      const chunks = [];
      const downloadStream = gfs.openDownloadStreamByName(req.file.filename);
      
      downloadStream.on('data', (chunk) => {
        console.log("Receiving chunk");
        chunks.push(chunk);
      });

      downloadStream.on('error', (error) => {
        console.error("Stream error:", error);
        res.status(500).json({ error: "Error reading file" });
      });

      downloadStream.on('end', async () => {
        console.log("Stream ended, processing file");
        try {
          const buffer = Buffer.concat(chunks);
          
          // Process Excel file
          const workbook = XLSX.read(buffer);
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet);
          
          console.log("Excel data processed, saving to DB");
          // Save to MongoDB
          const result = await ExcelData.create({ data: data });
          
          console.log("Data saved successfully");
          res.status(200).json({ 
            message: "File uploaded and processed successfully",
            recordsProcessed: data.length
          });
        } catch (error) {
          console.error("Processing error:", error);
          res.status(500).json({ error: error.message });
        }
      });
    } catch (error) {
      console.error("Stream setup error:", error);
      res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

app.use((err, req, res, next) => {
  console.error('Error details:', err);
  res.status(500).json({ 
    error: err.message,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});