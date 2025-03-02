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
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);

  useEffect(() => {
    const fetchAgentName = async () => {
  try {
    const res = await axios.get('/api/session');
    if (res.data.logged_in) {
      setAgentName(`${res.data.user.firstname} ${res.data.user.lastname}`);
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

    // Real-time detection handler
    const eventSource = new EventSource('/api/detection-events');
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setDetectionAlerts(prev => ({
        ...prev,
        [data.stream_url]: data.detections
      }));
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      eventSource.close();
    };

    fetchAgentName();
    fetchDashboard();
    fetchLogs();
    
    const interval = setInterval(fetchDashboard, 10000);
    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, []);

  const filteredLogs = logs.filter((log) =>
    log.room_url.toLowerCase().includes(filter.toLowerCase()) ||
    log.event_type.toLowerCase().includes(filter.toLowerCase())
  );

  const closeModal = () => setSelectedAssignment(null);

  return (
    <div className="agent-dashboard">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-left">Hi, {agentName}!</div>
          <div className="nav-right">
            <button className="logout-button" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="streams-section">
          <h2>Assigned Streams</h2>
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
                  alerts={detectionAlerts[assignment.room_url] || []}
                />
                <div className="assignment-details">
                  <p><strong>{assignment.streamer_username}</strong></p>
                  <p><small>{assignment.platform}</small></p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="logs-section">
          <h3>Detection Logs</h3>
          <div className="filter-container">
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="logs-table-container">
            {loading ? (
              <div className="loading">Loading logs...</div>
            ) : filteredLogs.length > 0 ? (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Stream</th>
                    <th>Event Type</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td>{log.room_url.split('/').pop()}</td>
                      <td>{log.event_type}</td>
                      <td>{JSON.stringify(log.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="no-logs">No detection events found</div>
            )}
          </div>
        </div>
      </div>

      {selectedAssignment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeModal}>×</button>
            <h2>{selectedAssignment.streamer_username}'s Stream</h2>
            <VideoPlayer 
              room_url={selectedAssignment.room_url} 
              streamer_username={selectedAssignment.streamer_username}
              alerts={detectionAlerts[selectedAssignment.room_url] || []}
            />
            <div className="stream-info">
              <p><strong>Platform:</strong> {selectedAssignment.platform}</p>
              <p><strong>URL:</strong> {selectedAssignment.room_url}</p>
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

        .navbar {
          background: #1a1a1a;
          padding: 1rem 2rem;
          border-bottom: 1px solid #2d2d2d;
        }

        .nav-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 900px;
          margin: 0 auto;
        }

        .nav-left {
          font-size: 1.2rem;
          color: #007bff;
        }

        .logout-button {
          padding: 0.5rem 1.5rem;
          background: linear-gradient(135deg, #007bff, #0056b3);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .logout-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,123,255,0.3);
        }

        .dashboard-content {
          max-width: 900px;
          margin: 2rem auto;
          padding: 0 1rem;
        }

        .assignment-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .assignment-card {
          background: #2d2d2d;
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease;
          cursor: pointer;
          border: 1px solid #3d3d3d;
        }

        .assignment-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
          border-color: #007bff;
        }

        .assignment-details {
          padding: 1rem;
          text-align: center;
          background: #252525;
          border-top: 1px solid #3d3d3d;
        }

        .logs-section {
          margin-top: 2rem;
          background: #1a1a1a;
          padding: 1.5rem;
          border-radius: 12px;
        }

        .filter-container input {
          width: 100%;
          padding: 0.8rem;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          color: #e0e0e0;
          margin-bottom: 1rem;
          transition: all 0.3s ease;
        }

        .filter-container input:focus {
          border-color: #007bff;
          box-shadow: 0 0 10px rgba(0,123,255,0.3);
          outline: none;
        }

        .logs-table {
          width: 100%;
          border-collapse: collapse;
          background: #2d2d2d;
          border-radius: 8px;
          overflow: hidden;
        }

        th, td {
          padding: 0.8rem;
          text-align: left;
          border-bottom: 1px solid #3d3d3d;
        }

        th {
          background: #007bff20;
          font-weight: 600;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(5px);
        }

        .modal-content {
          background: #2d2d2d;
          padding: 1.5rem;
          border-radius: 12px;
          max-width: 600px;
          width: 90%;
          position: relative;
          animation: zoomIn 0.3s ease;
          border: 1px solid #3d3d3d;
        }

        @keyframes zoomIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .close-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          cursor: pointer;
          font-size: 1.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .close-button:hover {
          transform: rotate(90deg) scale(1.1);
        }

        .stream-info {
          margin-top: 1rem;
          padding: 1rem;
          background: #252525;
          border-radius: 8px;
        }

        .loading, .no-logs {
          text-align: center;
          padding: 2rem;
          color: #a0a0a0;
        }

        @media (max-width: 768px) {
          .nav-container {
            padding: 0 1rem;
          }

          .dashboard-content {
            padding: 0 1rem;
            margin: 1rem auto;
          }

          .assignment-grid {
            grid-template-columns: 1fr;
          }

          .logs-section {
            padding: 1rem;
          }

          th, td {
            padding: 0.6rem;
            font-size: 0.9em;
          }

          .modal-content {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default AgentDashboard;