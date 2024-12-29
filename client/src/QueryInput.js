import React, { useState } from 'react';
import './QueryInput.css';

const QueryInput = () => {
    const [query, setQuery] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const handleQueryChange = (e) => {
        setQuery(e.target.value);
        setErrorMessage(''); // Clear any previous error
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!query.trim()) {
            setErrorMessage('Please enter a query.');
            return;
        }

        try {
            console.log('Query submitted:', query);
            // Here you can add API call to process the query
            
        } catch (error) {
            console.error('Error:', error);
            setErrorMessage('Failed to process query. Please try again.');
        }
    };

    return (
        <div className="query-input-container">
            <h4 className="query-heading">Enter Your Query:</h4>
            <form className="query-form" onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="Enter your query here..."
                    className="query-text-input"
                />
                {errorMessage && <p className="error-message">{errorMessage}</p>}
                <button type="submit" className="query-button">
                    Submit Query
                </button>
            </form>
        </div>
    );
};

export default QueryInput;
