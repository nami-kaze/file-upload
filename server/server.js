const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const path = require('path');
const Grid = require('gridfs-stream');
const crypto = require('crypto');
const GridFsStorage = require('multer-gridfs-storage').GridFsStorage;
const dotenv = require('dotenv');
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
// Add better error handling in your upload route
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Your existing file processing code
    const workbook = XLSX.read(req.file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Add logging
    console.log("File received:", req.file.originalname);
    console.log("Data length:", data.length);

    // Your MongoDB save logic
    const result = await YourModel.insertMany(data);
    
    res.status(200).json({ 
      message: "File uploaded successfully",
      recordsProcessed: data.length
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});