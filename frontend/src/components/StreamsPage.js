import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Platform-specific stream table components
const ChaturbateTable = ({ streams, onDelete }) => {
  if (streams.length === 0) return <p>No Chaturbate streams available.</p>;
  
  return (
    <table className="streams-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Room URL</th>
          <th>Streamer Username</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {streams.map((stream) => (
          <tr key={stream.id}>
            <td>{stream.id}</td>
            <td>
              <a
                href={stream.room_url}
                target="_blank"
                rel="noopener noreferrer"
                className="stream-link"
              >
                {stream.room_url}
              </a>
            </td>
            <td>{stream.streamer_username}</td>
            <td>
              <button 
                onClick={() => onDelete(stream.id)} 
                className="delete-button"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const StripchatTable = ({ streams, onDelete }) => {
  if (streams.length === 0) return <p>No Stripchat streams available.</p>;
  
  return (
    <table className="streams-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Room URL</th>
          <th>Streamer Username</th>
          <th>Streamer UID</th>
          <th>Edge Server URL</th>
          <th>Thumbnail</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {streams.map((stream) => (
          <tr key={stream.id}>
            <td>{stream.id}</td>
            <td>
              <a
                href={stream.room_url}
                target="_blank"
                rel="noopener noreferrer"
                className="stream-link"
              >
                {stream.room_url}
              </a>
            </td>
            <td>{stream.streamer_username}</td>
            <td>{stream.streamer_uid || 'N/A'}</td>
            <td className="edge-url">
              {stream.edge_server_url ? 
                <span className="truncate-text">{stream.edge_server_url}</span> : 
                'N/A'
              }
            </td>
            <td>
              {stream.static_thumbnail ? (
                <img
                  src={stream.static_thumbnail}
                  alt="Thumbnail"
                  className="thumbnail-image"
                />
              ) : (
                'N/A'
              )}
            </td>
            <td>
              <button 
                onClick={() => onDelete(stream.id)} 
                className="delete-button"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Add New Stream Form Component
const AddStreamForm = ({ onAddStream }) => {
  const [platform, setPlatform] = useState('chaturbate');
  const [roomUrl, setRoomUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await axios.post('/api/streams', {
        room_url: roomUrl,
        platform: platform
      });
      
      onAddStream(response.data.stream);
      setRoomUrl('');
      setIsSubmitting(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add stream');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="form-container">
      <h2 className="form-title">Add New Stream</h2>
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Platform:</label>
          <select 
            value={platform} 
            onChange={(e) => setPlatform(e.target.value)}
            className="form-select"
          >
            <option value="chaturbate">Chaturbate</option>
            <option value="stripchat">Stripchat</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Room URL:</label>
          <input 
            type="text"
            value={roomUrl}
            onChange={(e) => setRoomUrl(e.target.value)}
            placeholder={`Enter ${platform} room URL`}
            className="form-input"
            required
          />
        </div>
        
        <button 
          type="submit" 
          className="add-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Adding...' : 'Add Stream'}
        </button>
      </form>
    </div>
  );
};

function StreamsPage() {
  // State variables
  const [chaturbateStreams, setChaturbateStreams] = useState([]);
  const [stripchatStreams, setStripchatStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('chaturbate');

  // Fetch streams for a specific platform
  const fetchStreams = async (platform) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/streams?platform=${platform}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (platform === 'chaturbate') {
        setChaturbateStreams(response.data);
      } else if (platform === 'stripchat') {
        setStripchatStreams(response.data);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch streams');
      setLoading(false);
    }
  };

  // Delete a stream
  const handleDeleteStream = async (streamId, platform) => {
    if (!window.confirm('Are you sure you want to delete this stream?')) {
      return;
    }

    try {
      await axios.delete(`/api/streams/${streamId}`);
      // Update state after successful deletion
      if (platform === 'chaturbate') {
        setChaturbateStreams((prevStreams) => prevStreams.filter((stream) => stream.id !== streamId));
      } else if (platform === 'stripchat') {
        setStripchatStreams((prevStreams) => prevStreams.filter((stream) => stream.id !== streamId));
      }
    } catch (err) {
      console.error('Failed to delete stream:', err);
      alert(err.response?.data?.message || 'Failed to delete stream');
    }
  };

  // Add a new stream
  const handleAddStream = (newStream) => {
    if (newStream.platform.toLowerCase() === 'chaturbate') {
      setChaturbateStreams((prevStreams) => [...prevStreams, newStream]);
    } else if (newStream.platform.toLowerCase() === 'stripchat') {
      setStripchatStreams((prevStreams) => [...prevStreams, newStream]);
    }
    setActiveTab(newStream.platform.toLowerCase());
  };

  // Initial data fetch for both platforms
  useEffect(() => {
    fetchStreams('chaturbate');
    fetchStreams('stripchat');
  }, []);

  if (loading) return (
    <div className="streams-container">
      <div className="loading-container">
        <div className="loading-text">Loading streams...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="streams-container">
      <div className="error-container">
        Error: {error}
      </div>
      <button 
        onClick={() => {
          fetchStreams('chaturbate');
          fetchStreams('stripchat');
        }}
        className="retry-button"
      >
        Try Again
      </button>
    </div>
  );

  return (
    <div className="streams-container">
      <h1 className="page-title">Stream Management</h1>
      
      {/* Add New Stream Form */}
      <AddStreamForm onAddStream={handleAddStream} />
      
      {/* Tab Navigation */}
      <div className="tabs-container">
        <nav className="tabs-nav">
          <button 
            onClick={() => setActiveTab('chaturbate')} 
            className={`tab-button ${activeTab === 'chaturbate' ? 'active' : ''}`}
          >
            Chaturbate ({chaturbateStreams.length})
          </button>
          <button 
            onClick={() => setActiveTab('stripchat')} 
            className={`tab-button ${activeTab === 'stripchat' ? 'active' : ''}`}
          >
            Stripchat ({stripchatStreams.length})
          </button>
        </nav>
      </div>
      
      {/* Platform Specific Tables */}
      <div className="tables-container">
        {activeTab === 'chaturbate' && (
          <div className="platform-section">
            <h2 className="section-title">Chaturbate Streams</h2>
            <ChaturbateTable 
              streams={chaturbateStreams} 
              onDelete={(streamId) => handleDeleteStream(streamId, 'chaturbate')} 
            />
          </div>
        )}
        
        {activeTab === 'stripchat' && (
          <div className="platform-section">
            <h2 className="section-title">Stripchat Streams</h2>
            <StripchatTable 
              streams={stripchatStreams} 
              onDelete={(streamId) => handleDeleteStream(streamId, 'stripchat')} 
            />
          </div>
        )}
      </div>

     <style jsx>{`
        .streams-container {
          padding: 20px;
          max-width: 900px;
          margin: 0 auto;
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: bold;
          margin-bottom: 1.5rem;
          color: #e0e0e0;
        }

        .form-container {
          margin: 1.5rem 0;
          padding: 1rem;
          background: #1a1a1a;
          border-radius: 8px;
          border: 1px solid #2d2d2d;
        }

        .form-title {
          font-size: 1.25rem;
          font-weight: bold;
          margin-bottom: 1rem;
          color: #e0e0e0;
        }

        .error-message {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: rgba(255, 68, 68, 0.1);
          color: #ff4444;
          border-radius: 4px;
          border-left: 3px solid #ff4444;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          color: #a0a0a0;
        }

        .form-select, .form-input {
          width: 100%;
          padding: 0.75rem;
          background: #252525;
          border: 1px solid #333;
          border-radius: 4px;
          color: #e0e0e0;
          transition: all 0.3s ease;
        }

        .form-select:focus, .form-input:focus {
          border-color: #007bff;
          outline: none;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
        }

        .add-button {
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .add-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        }

        .add-button:disabled {
          background: #333;
          cursor: not-allowed;
          transform: none;
        }

        .tabs-container {
          margin-bottom: 1rem;
          border-bottom: 1px solid #2d2d2d;
        }

        .tabs-nav {
          display: flex;
          gap: 0.5rem;
        }

        .tab-button {
          padding: 0.75rem 1.25rem;
          background: none;
          border: none;
          color: #a0a0a0;
          cursor: pointer;
          position: relative;
          transition: all 0.3s ease;
        }

        .tab-button::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: #007bff;
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .tab-button.active, .tab-button:hover {
          color: #fff;
        }

        .tab-button.active::before {
          transform: scaleX(1);
        }

        .platform-section {
          margin-top: 1.5rem;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #e0e0e0;
        }

        .streams-table {
          width: 100%;
          border-collapse: collapse;
          background: #1a1a1a;
          border-radius: 8px;
          overflow: hidden;
        }

        .streams-table th {
          padding: 0.75rem 1rem;
          text-align: left;
          background: #252525;
          color: #e0e0e0;
          font-weight: 500;
          border-bottom: 1px solid #333;
        }

        .streams-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #2d2d2d;
          color: #e0e0e0;
        }

        .streams-table tr:hover {
          background: #252525;
        }

        .stream-link {
          color: #007bff;
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .stream-link:hover {
          text-decoration: underline;
        }

        .edge-url {
          max-width: 200px;
          font-size: 0.75rem;
        }

        .truncate-text {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .thumbnail-image {
          width: 6rem;
          height: auto;
          border-radius: 4px;
        }

        .delete-button {
          padding: 0.4rem 0.75rem;
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .delete-button:hover {
          background: #cc3333;
        }

        .loading-container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 8rem;
        }

        .loading-text {
          font-size: 1.1rem;
          color: #a0a0a0;
        }

        .error-container {
          padding: 1rem;
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid #ff4444;
          border-radius: 4px;
          color: #ff4444;
        }

        .retry-button {
          margin-top: 1rem;
          padding: 0.75rem 1.25rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .retry-button:hover {
          background: #0056b3;
        }

        @media (max-width: 768px) {
          .streams-table {
            display: block;
            overflow-x: auto;
          }

          .form-container, .platform-section {
            padding: 0.75rem;
          }

          .tab-button {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
          }
        }
      `}</style>
    </div>
  );
}

export default StreamsPage;