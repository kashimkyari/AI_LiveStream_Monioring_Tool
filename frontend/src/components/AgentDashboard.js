import React, { useState, useEffect } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';

const AgentDashboard = ({ onLogout }) => {
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, assignments: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState('');

  const fetchAgentName = async () => {
    try {
      const res = await axios.get('/api/session');
      if (res.data.logged_in) {
        setAgentName(res.data.user.username);
      }
    } catch (error) {
      console.error("Error fetching agent name:", error);
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await axios.get('/api/agent/dashboard');
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching agent dashboard data:', error);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/logs');
      setLogs(res.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAgentName();
    fetchDashboard();
    fetchLogs();
    
    const dashboardInterval = setInterval(fetchDashboard, 10000);
    const logsInterval = setInterval(fetchLogs, 10000);
    
    return () => {
      clearInterval(dashboardInterval);
      clearInterval(logsInterval);
    };
  }, []);

  const filteredLogs = logs.filter((log) =>
    log.stream_url.toLowerCase().includes(filter.toLowerCase()) ||
    log.event_type.toLowerCase().includes(filter.toLowerCase())
  );

  const closeModal = () => setSelectedAssignment(null);

  return (
    <div className="agent-dashboard">
     

      <div className="dashboard-section">
        <div className="my-streams">
          <h3>Assigned Streams</h3>
          <p><strong>Ongoing Streams:</strong> {dashboardData.ongoing_streams}</p>
          <div className="assignment-grid">
            {dashboardData.assignments.map((assignment) => (
              <div 
                key={assignment.id} 
                className="assignment-card" 
                onClick={() => setSelectedAssignment(assignment)}
              >
                <VideoPlayer 
                  room_url={assignment.room_url} 
                  streamer_username={assignment.streamer_username}
                  thumbnail={true}
                  alerts={[]}
                />
                <div className="assignment-details">
                  <p><strong>Platform:</strong> {assignment.platform}</p>
                  <p><strong>Streamer:</strong> {assignment.streamer_username}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="logs-section">
        <h3>Detection Logs</h3>
        <div className="filter-container">
          <input
            type="text"
            placeholder="Filter logs by stream URL or event type"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="loading">Loading logs...</div>
        ) : filteredLogs.length > 0 ? (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Stream URL</th>
                <th>Event Type</th>
                <th>Detections</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.stream_url}</td>
                  <td>{log.event_type}</td>
                  <td>
                    {log.details?.detections?.map((d, i) => (
                      <div key={i}>{d.class} ({d.confidence?.toFixed(2)})</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No logs found.</p>
        )}
      </div>

      {selectedAssignment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeModal}>X</button>
            <h3>Stream Details</h3>
            <VideoPlayer 
              room_url={selectedAssignment.room_url} 
              streamer_username={selectedAssignment.streamer_username}
              thumbnail={true}
            />
            <div className="stream-info">
              <p><strong>Platform:</strong> {selectedAssignment.platform}</p>
              <p><strong>Streamer:</strong> {selectedAssignment.streamer_username}</p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .agent-dashboard {
          min-height: 100vh;
          background: #121212;
          color: #e0e0e0;
          font-family: 'Inter', sans-serif;
        }

        .app-header {
          padding: 20px 40px;
          background: #1a1a1a;
          border-bottom: 1px solid #2d2d2d;
        }

        .nav-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
        }

        .greeting {
          font-size: 1.1rem;
          color: #a0a0a0;
        }

        .logout-button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .dashboard-section {
          max-width: 1200px;
          margin: 40px auto;
          padding: 0 20px;
        }

        .my-streams {
          background: #1a1a1a;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 40px;
        }

        .assignment-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }

        .assignment-card {
          background: #2d2d2d;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .assignment-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }

        .assignment-details {
          padding: 15px;
          border-top: 1px solid #3d3d3d;
        }

        .logs-section {
          max-width: 1200px;
          margin: 0 auto 40px;
          padding: 0 20px;
        }

        .filter-container input {
          width: 100%;
          padding: 12px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          color: #e0e0e0;
          margin-bottom: 20px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          background: #2d2d2d;
          border-radius: 8px;
          overflow: hidden;
        }

        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #3d3d3d;
        }

        th {
          background: #007bff20;
        }

        .modal-content .stream-info {
          padding: 15px;
          background: #252525;
          margin-top: 15px;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
};

export default AgentDashboard;