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
app.use(cors())
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
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  res.send('File uploaded successfully.');
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});