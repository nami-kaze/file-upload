const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const path = require('path');
const Grid = require('gridfs-stream');
const crypto = require('crypto');
const GridFsStorage = require('multer-gridfs-storage').GridFsStorage;
const dotenv = require('dotenv');
const XLSX = require('xlsx');
var cors = require('cors')


dotenv.config();
const app = express();
app.use(cors({
  origin: [
      'http://localhost:3000',
      'https://file-upload-meas.vercel.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
const PORT = process.env.PORT || 5000;
// MongoDB connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, { 
    useNewUrlParser: true, useUnifiedTopology: true 
});
const conn = mongoose.connection;
let gfs;
conn.once('open', () => {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('excel-upload');
});
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString('hex') + 
                            path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: 'excel-upload'
        };
        resolve(fileInfo);
      });
    });
  }
});
const upload = multer({ storage });
// Create a MongoDB Schema for your Excel data
const excelDataSchema = new mongoose.Schema({
    // Add your fields based on Excel structure
    // For example:
    data: Object
}, { strict: false }); // Using strict: false allows flexible document structure

const ExcelData = mongoose.model('ExcelData', excelDataSchema);
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
    const file = await gfs.files.findOne({ filename: req.file.filename });
    if (!file) {
      console.log("File not found in GridFS");
      return res.status(404).json({ error: "File not found after upload" });
    }
    console.log("File found in GridFS");

    // Create read stream
    const readStream = gfs.createReadStream(file.filename);
    const chunks = [];
    
    readStream.on('data', chunk => {
      console.log("Receiving chunk");
      chunks.push(chunk)
    });
    
    readStream.on('error', err => {
      console.error("Stream error:", err);
      res.status(500).json({ error: "Error reading file" });
    });
    
    readStream.on('end', async () => {
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});