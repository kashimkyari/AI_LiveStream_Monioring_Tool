import React, { useState, useEffect } from 'react';
import axios from 'axios';

const StreamsPage = () => {
  const [streams, setStreams] = useState([]);
  const [newStream, setNewStream] = useState({ room_url: '', platform: 'Chaturbate' });
  const [streamMsg, setStreamMsg] = useState('');
  const [streamError, setStreamError] = useState('');

  const fetchStreams = async () => {
    try {
      const res = await axios.get('/api/streams');
      setStreams(res.data);
    } catch (error) {
      console.error('Error fetching streams:', error);
    }
  };

  const handleCreateStream = async () => {
    setStreamError('');
    setStreamMsg('');
    if (!newStream.room_url.trim()) {
      setStreamError('Room URL is required.');
      return;
    }
    try {
      const res = await axios.post('/api/streams', newStream);
      setStreamMsg(res.data.message);
      setNewStream({ room_url: '', platform: 'Chaturbate' });
      fetchStreams();
    } catch (error) {
      setStreamError(error.response?.data.message || 'Error creating stream.');
    }
  };

  const handleDeleteStream = async (streamId) => {
    try {
      await axios.delete(`/api/streams/${streamId}`);
      fetchStreams();
    } catch (error) {
      console.error('Error deleting stream:', error);
    }
  };

  useEffect(() => {
    fetchStreams();
  }, []);

  return (
    <div className="tab-content">
      <h3>Manage Streams</h3>
      <div className="form-container">
        <input
          type="text"
          placeholder="Room URL (e.g., https://chaturbate.com/cutefacebigass/)"
          value={newStream.room_url}
          onChange={(e) => setNewStream({ ...newStream, room_url: e.target.value })}
        />
        <select
          value={newStream.platform}
          onChange={(e) => setNewStream({ ...newStream, platform: e.target.value })}
        >
          <option value="Chaturbate">Chaturbate</option>
          <option value="Stripchat">Stripchat</option>
        </select>
        <button onClick={handleCreateStream}>Create Stream</button>
      </div>
      {streamError && <div className="error">{streamError}</div>}
      {streamMsg && <div className="message">{streamMsg}</div>}

      {/* Chaturbate Streams Table */}
      <h4>Chaturbate Streams</h4>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Room URL</th>
            <th>Streamer</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {streams.filter(s => s.platform === 'Chaturbate').map((stream) => (
            <tr key={stream.id}>
              <td>{stream.id}</td>
              <td>{stream.room_url}</td>
              <td>{stream.streamer_username}</td>
              <td>
                <button onClick={() => handleDeleteStream(stream.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Stripchat Streams Table */}
      <h4>Stripchat Streams</h4>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Streamer UID</th>
            <th>HLS URL</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {streams.filter(s => s.platform === 'Stripchat').map((stream) => (
            <tr key={stream.id}>
              <td>{stream.id}</td>
              <td>{stream.streamer_uid}</td>
              <td>
                <a href={stream.edge_server_url} target="_blank" rel="noopener noreferrer">
                  HLS Stream
                </a>
              </td>
              <td>
                <button onClick={() => handleDeleteStream(stream.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .tab-content {
          margin-top: 25px;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .form-container {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .form-container input, 
        .form-container select {
          padding: 12px 18px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          flex: 1;
          color: #e0e0e0;
          transition: all 0.3s ease;
          min-width: 200px;
        }

        .form-container input:focus, 
        .form-container select:focus {
          border-color: #007bff;
          box-shadow: 0 0 10px rgba(0,123,255,0.3);
          outline: none;
        }

        .form-container button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .form-container button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,123,255,0.3);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          background: #2d2d2d;
          border-radius: 10px;
          overflow: hidden;
        }

        table th, table td {
          padding: 14px;
          border: 1px solid #3d3d3d;
          color: #e0e0e0;
        }

        table th {
          background: #007bff20;
          font-weight: 600;
        }

        h4 {
          margin-top: 30px;
          margin-bottom: 15px;
          color: #e0e0e0;
        }

        .error {
          color: #ff4444;
          background: #ff444410;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ff444430;
          margin: 15px 0;
          animation: shake 0.4s ease;
        }

        .message {
          color: #28a745;
          background: #28a74510;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #28a74530;
          margin: 15px 0;
        }

        button {
          transition: all 0.3s ease;
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
        }

        button:hover {
          filter: brightness(1.1);
          transform: translateY(-2px);
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
};

export default StreamsPage;