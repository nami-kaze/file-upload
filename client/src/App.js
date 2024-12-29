import React from 'react';
import FileUpload from './FileUpload';
import QueryInput from './QueryInput';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1 align="center">Query Interface</h1>
      <h4 align="center">Analyze your data using natural language queries</h4>
      <FileUpload />
      <QueryInput />
    </div>
  );
}

export default App;