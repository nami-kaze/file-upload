import React, { useState } from 'react';
import axios from 'axios';
import './FileUpload.css';

const FileUpload = () => {
    const [file, setFile] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            const allowedExtensions = ['.xls', '.xlsx'];
            const fileExtension = selectedFile.name.split('.').pop().toLowerCase();

            // Check if the file has a valid Excel extension
            if (allowedExtensions.includes('.' + fileExtension)) {
                setFile(selectedFile);
                setErrorMessage(''); // Clear any previous error
            } else {
                setErrorMessage('Please upload a valid Excel file (.xls or .xlsx).');
                setFile(null); // Clear the file state if it's invalid
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
            setErrorMessage('No file selected.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            alert('File uploaded successfully');
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file');
        }
    };

    return (
        <div className="file-upload-container">
            <h1 className="upload-heading">Excel File Uploads</h1>
            <form className="file-upload-form" onSubmit={handleSubmit}>
                <input
                    type="file"
                    onChange={handleFileChange}
                    className="file-input"
                />
                {errorMessage && <p className="error-message">{errorMessage}</p>}
                <button type="submit" className="upload-button">
                    Upload
                </button>
            </form>
        </div>
    );
};

export default FileUpload;
