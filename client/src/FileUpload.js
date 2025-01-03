import React, { useState } from 'react';
import axios from 'axios';
import './FileUpload.css';

const FileUpload = () => {
    const [file, setFile] = useState(null);
    const [filePath, setFilePath] = useState('');
    const [sqlQuery, setSqlQuery] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [queryResults, setQueryResults] = useState(null);
    const [generatedSQL, setGeneratedSQL] = useState('');

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            const allowedExtensions = ['.csv', '.xlsx', '.xls'];
            const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();

            if (allowedExtensions.includes(fileExtension)) {
                setFile(selectedFile);
                setErrorMessage('');
            } else {
                setErrorMessage('Please upload a valid CSV or Excel file');
                setFile(null);
            }
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            setErrorMessage('No file selected.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/upload_file`, formData);
            setFilePath(response.data.filePath);
            alert('File uploaded successfully!');
        } catch (error) {
            console.error('Error uploading file:', error);
            setErrorMessage('Failed to upload file');
        }
    };

    const handleGenerateSQL = async () => {
        if (!filePath || !sqlQuery) {
            setErrorMessage('Please upload a file and enter a query first');
            return;
        }

        try {
            const response = await axios.post(
                `${process.env.REACT_APP_API_URL}/generate_sql`,
                {
                    text: sqlQuery,
                    filePath: filePath
                }
            );

            setQueryResults(response.data.data);
            setGeneratedSQL(response.data.query);
            setErrorMessage('');

        } catch (error) {
            console.error('Error generating SQL:', error);
            let errorMessage = 'Failed to generate SQL query';
            
            if (error.response) {
                errorMessage = error.response.data.error || errorMessage;
            } else if (error.request) {
                errorMessage = 'No response from server';
            }
            
            setErrorMessage(errorMessage);
            setQueryResults(null);
            setGeneratedSQL('');
        }
    };

    const handleDownloadCSV = () => {
        if (!queryResults || queryResults.length === 0) {
            setErrorMessage('No data to download');
            return;
        }

        try {
            // Convert data to CSV
            const headers = Object.keys(queryResults[0]);
            const csvContent = [
                headers.join(','),
                ...queryResults.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        // Handle values that might contain commas
                        return value === null ? '' : 
                               typeof value === 'string' && value.includes(',') ? 
                               `"${value}"` : value;
                    }).join(',')
                )
            ].join('\n');

            // Create and trigger download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'query_results.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            setErrorMessage('Failed to download CSV');
            console.error('Download error:', error);
        }
    };

    return (
        <div className="file-upload-container">
            <h1 className="main-title">Query Interface</h1>
            
            {/* Step 1: File Upload Section */}
            <div className="upload-section">
                <h2 className="section-title">Step 1: Upload Your CSV File</h2>
                <form onSubmit={handleUpload} className="upload-form">
                    <div className="file-input-wrapper">
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="file-input"
                            id="file-input"
                        />
                        <label htmlFor="file-input" className="file-label">
                            Choose a file
                        </label>
                        {file && <span className="file-name">{file.name}</span>}
                    </div>
                    <button type="submit" className="upload-button">
                        Upload File
                    </button>
                </form>
            </div>

            {/* Step 2: Query Input Section - Only shown after file upload */}
            {filePath && (
                <div className="query-section">
                    <h2 className="section-title">Step 2: Describe Your Query</h2>
                    <div className="query-input-wrapper">
                        <textarea
                            value={sqlQuery}
                            onChange={(e) => setSqlQuery(e.target.value)}
                            placeholder="Describe what you want to know from your data..."
                            className="query-input"
                        />
                        <button
                            onClick={handleGenerateSQL}
                            className="generate-button"
                        >
                            Generate SQL
                        </button>
                    </div>
                </div>
            )}

            {/* Error Messages */}
            {errorMessage && <p className="error-message">{errorMessage}</p>}

            {/* Results Section */}
            {(generatedSQL || queryResults) && (
                <div className="results-container">
                    {generatedSQL && (
                        <div className="results-section">
                            <h2 className="section-title">Generated SQL Query</h2>
                            <pre className="sql-query">{generatedSQL}</pre>
                        </div>
                    )}

                    {queryResults && (
                        <div className="results-section">
                            <h2 className="section-title">Query Results</h2>
                            <div className="results-table">
                                <table>
                                    <thead>
                                        <tr>
                                            {Object.keys(queryResults[0] || {}).map((header, index) => (
                                                <th key={index}>{header}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queryResults.map((row, rowIndex) => (
                                            <tr key={rowIndex}>
                                                {Object.values(row).map((value, colIndex) => (
                                                    <td key={colIndex}>{value}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button onClick={handleDownloadCSV} className="download-button">
                                Download CSV
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FileUpload;
