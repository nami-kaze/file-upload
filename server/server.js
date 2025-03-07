const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const duckdb = require('duckdb');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const os = require('os');
const path = require('path');

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const app = express();
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://file-upload-meas.vercel.app',
        'https://file-upload-brown.vercel.app',
        'https://file-upload-9v08.onrender.com/'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
app.use(express.json());

// Configure multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

// Test route
app.get('/', (req, res) => {
  res.json({ message: "Server running successfully" });
});

// File upload route
app.post('/upload_file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided." });
  }

  try {
    // Upload to Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: "raw" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    res.json({
      message: "File uploaded successfully!",
      filePath: uploadResponse.secure_url
    });
  } catch (error) {
    res.status(500).json({ error: `Error uploading to Cloudinary: ${error.message}` });
  }
});

// Generate SQL route
app.post('/generate_sql', async (req, res) => {
  const { text, filePath } = req.body;

  if (!text || !filePath) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    // Download file from Cloudinary
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const buffer = await response.buffer();
    validateCSVContent(buffer);
    
    // Initialize DuckDB
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();

    // Create a temporary file to store the CSV data
    const tempFilePath = path.join(os.tmpdir(), `${Date.now()}.csv`);
    require('fs').writeFileSync(tempFilePath, buffer);

    // Load data into DuckDB with explicit CSV options
    await new Promise((resolve, reject) => {
        try {
            // First validate the CSV content
            validateCSVContent(buffer);
            
            // Create table with explicit CSV options
            const createTableSQL = `
                CREATE TABLE uploaded_csv AS 
                SELECT * FROM read_csv('${tempFilePath}', 
                    header=true,
                    sep=',',
                    all_varchar=true,
                    ignore_errors=true,
                    sample_size=1000,
                    quote='"',
                    escape='"',
                    skip=0,
                    null_padding=true
                )`;
            
            conn.exec(createTableSQL, (err) => {
                if (err) {
                    console.error('CSV Loading Error:', err);
                    reject(err);
                } else {
                    console.log('Table created successfully');
                    resolve();
                }
            });
        } catch (error) {
            console.error('CSV Processing Error:', error);
            reject(error);
        }
    });

    // Add validation check
    console.log('Validating loaded data...');
    await validateCSVData(conn);
    console.log('Data validation successful');

    // Get schema and sample data
    const schema = await new Promise((resolve, reject) => {
        conn.all(`DESCRIBE uploaded_csv`, (err, result) => {
            if (err) reject(err);
            resolve(result);
        });
    });
    console.log("Table Schema:", schema);

    const tableStructure = await new Promise((resolve, reject) => {
        conn.all(`SELECT * FROM uploaded_csv LIMIT 5`, (err, result) => {
            if (err) reject(err);
            resolve(result);
        });
    });
    console.log("Sample Data:", tableStructure);

    // Generate SQL using Google AI
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `You are an SQL query generator for DuckDB. 
                   Given this request: "${text}" 
                   and this table structure: ${JSON.stringify(tableStructure)},
                   and schema: ${JSON.stringify(schema)},
                   generate ONLY a valid DuckDB SQL query for table 'uploaded_csv'.
                   Rules:
                   1. Use only basic SQL operations (SELECT, WHERE, GROUP BY, etc.)
                   2. Do not use any DuckDB-specific extensions
                   3. Table name is 'uploaded_csv'
                   4. Do not include any explanations or comments
                   5. Do not include markdown formatting
                   6. Ensure the query ends with a semicolon`;

    const result = await model.generateContent(prompt);
    let sqlQuery = result.response.text();
    console.log('Generated SQL Query (before cleanup):', sqlQuery);

    // Clean up the SQL query
    sqlQuery = sqlQuery
        .replace(/```sql/gi, '')
        .replace(/```/g, '')
        .replace(/`/g, '')
        .trim();
    
    console.log('Final SQL Query:', sqlQuery);

    if (!sqlQuery) {
        throw new Error('Failed to generate SQL query');
    }

    // Execute generated SQL
    try {
        const queryResult = await new Promise((resolve, reject) => {
            conn.all(sqlQuery, (err, result) => {
                if (err) reject(err);
                resolve(result);
            });
        });

        if (!queryResult || queryResult.length === 0) {
            throw new Error('Query returned no results');
        }

        res.json({
            success: true,
            data: queryResult,
            query: sqlQuery,
            message: 'Query executed successfully'
        });

    } catch (sqlError) {
        throw new Error(`SQL execution failed: ${sqlError.message}`);
    }

    // Clean up temporary file
    try {
        require('fs').unlinkSync(tempFilePath);
    } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
    }

  } catch (error) {
    console.error('Error in generate_sql:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

async function validateCSVData(conn) {
    const rowCount = await new Promise((resolve, reject) => {
        conn.all(`SELECT COUNT(*) as count FROM uploaded_csv`, (err, result) => {
            if (err) reject(err);
            resolve(result[0].count);
        });
    });

    if (rowCount === 0) {
        throw new Error('The uploaded CSV file is empty');
    }

    const columnCount = await new Promise((resolve, reject) => {
        conn.all(`SELECT * FROM uploaded_csv LIMIT 1`, (err, result) => {
            if (err) reject(err);
            resolve(Object.keys(result[0]).length);
        });
    });

    if (columnCount === 0) {
        throw new Error('The CSV file has no columns');
    }

    return { rowCount, columnCount };
}

function convertToCSV(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No data to convert to CSV');
    }
    
    try {
        const headers = Object.keys(data[0]);
        const rows = data.map(row => 
            headers.map(header => {
                const value = row[header];
                return value === null ? '' : String(value);
            })
        );
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    } catch (error) {
        throw new Error(`Failed to convert data to CSV: ${error.message}`);
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Add the last field
    result.push(current.trim());
    
    // Remove quotes from the beginning and end of fields
    return result.map(field => {
        if (field.startsWith('"') && field.endsWith('"')) {
            return field.slice(1, -1);
        }
        return field;
    });
}

function validateCSVContent(buffer) {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) {
        throw new Error('CSV file must have a header row and at least one data row');
    }

    // Parse and validate header
    const headerColumns = parseCSVLine(lines[0]);
    const columnCount = headerColumns.length;
    
    if (columnCount < 1) {
        throw new Error('CSV file must have at least one column');
    }

    // Validate each data row
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const row = parseCSVLine(lines[i]);
        if (row.length !== columnCount) {
            throw new Error(`Row ${i + 1} has ${row.length} columns, expected ${columnCount}`);
        }
    }

    return true;
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});