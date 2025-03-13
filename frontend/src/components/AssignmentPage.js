import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AssignmentPage = () => {
  const [agentList, setAgentList] = useState([]);
  const [streamList, setStreamList] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedStreamId, setSelectedStreamId] = useState('');

  const fetchAgents = async () => {
    try {
      const res = await axios.get('/api/agents');
      setAgentList(res.data);
      if (res.data.length > 0 && !selectedAgentId) {
        setSelectedAgentId(res.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchStreams = async () => {
    try {
      const res = await axios.get('/api/streams');
      setStreamList(res.data);
      if (res.data.length > 0 && !selectedStreamId) {
        setSelectedStreamId(res.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching streams:', error);
    }
  };

const handleAssign = async () => {
  if (!selectedAgentId || !selectedStreamId) {
    alert('Both Agent and Stream must be selected.');
    return;
  }
  try {
    const res = await axios.post('/api/assign', {
      agent_id: selectedAgentId, // Use "agent_id" instead of "agentId"
      stream_id: selectedStreamId, // Use "stream_id" instead of "streamId"
    });
    alert(res.data.message);
    // Refresh the streams and agents list after assignment
    fetchAgents();
    fetchStreams();
  } catch (err) {
    alert(err.response?.data?.message || 'Assignment failed.');
  }
};

  useEffect(() => {
    fetchAgents();
    fetchStreams();
  }, []);

  return (
    <div className="tab-content">
      <h3>Assign Stream</h3>
      <div className="form-container">
        <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)}>
          {agentList.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.username}</option>
          ))}
        </select>
        <select value={selectedStreamId} onChange={(e) => setSelectedStreamId(e.target.value)}>
          {streamList.map((stream) => (
            <option key={stream.id} value={stream.id}>
              ID: {stream.id} - {stream.room_url} ({stream.platform})
            </option>
          ))}
        </select>
        <button onClick={handleAssign}>Assign</button>
      </div>

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
      `}</style>
    </div>
  );
};

export default AssignmentPage;