import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const ScraperPage = () => {
  const [roomUrl, setRoomUrl] = useState('');
  const [scrapeResult, setScrapeResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef(null);

  const startProgress = () => {
    setProgress(0);
    progressInterval.current = setInterval(() => {
      setProgress(prev => (prev < 90 ? prev + 10 : prev));
    }, 300);
  };

  const stopProgress = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setProgress(100);
  };

  const handleScrape = async () => {
    setError('');
    setScrapeResult(null);
    if (!roomUrl.trim()) {
      setError('Please enter a room URL.');
      return;
    }
    startProgress();
    try {
      const res = await axios.post('/api/scrape', { room_url: roomUrl });
      stopProgress();
      setScrapeResult(res.data);
    } catch (err) {
      stopProgress();
      setError(err.response?.data?.message || 'Error scraping the URL.');
    }
  };

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const handleAddStream = async () => {
    setError('');
    try {
      const payload = {
        room_url: scrapeResult.room_url,
        platform: 'Chaturbate'
      };
      const res = await axios.post('/api/streams', payload);
      alert(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Error adding stream.');
    }
  };

  return (
    <div className="scraper-page">
      <h2>Chaturbate Scraper</h2>
      <div className="scrape-form">
        <input
          type="text"
          placeholder="Enter Chaturbate room URL (e.g., https://chaturbate.com/cutefacebigass/)"
          value={roomUrl}
          onChange={(e) => setRoomUrl(e.target.value)}
        />
        <button onClick={handleScrape}>Scrape</button>
      </div>
      {progress > 0 && progress < 100 && (
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {scrapeResult && (
        <div className="scrape-result">
          <p><strong>Room URL:</strong> {scrapeResult.room_url}</p>
          <p><strong>Streamer Username:</strong> {scrapeResult.streamer_username}</p>
          <p><strong>Page Title:</strong> {scrapeResult.page_title}</p>
          <button onClick={handleAddStream}>Add to Stream List</button>
        </div>
      )}
      <style jsx>{`
        .scraper-page {
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          animation: fadeIn 0.5s ease-in-out;
        }
        .scrape-form {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }
        input {
          flex: 1;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        button {
          padding: 10px 20px;
          background: #007bff;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        button:hover {
          background: #0056b3;
        }
        .progress-container {
          margin: 10px 0;
          background: #f0f0f0;
          border-radius: 4px;
          position: relative;
          height: 20px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: #007bff;
          transition: width 0.3s ease;
        }
        .progress-container span {
          position: absolute;
          width: 100%;
          text-align: center;
          top: 0;
          left: 0;
          font-size: 12px;
          line-height: 20px;
          color: #fff;
        }
        .error {
          color: #d9534f;
          text-align: center;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ScraperPage;

