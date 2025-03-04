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
  const [objectDetectionActive, setObjectDetectionActive] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

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
        console.log('Agent dashboard data loaded:', res.data);
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

    const initObjectDetection = () => {
      if (!objectDetectionActive) {
        console.log('Initializing object detection...');
        setObjectDetectionActive(true);
      }
    };

    fetchAgentName();
    fetchDashboard();
    fetchLogs();
    initObjectDetection();
    
    const interval = setInterval(fetchDashboard, 10000);
    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [objectDetectionActive]);

  const parseDetectionLog = (details) => {
    const result = {};
    if (!details || typeof details !== 'string') return result;
    const lines = details.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length >= 3) {
      const firstLineRegex = /^\d+:\s+(\d+x\d+)\s+(.+),\s*([\d.]+ms)$/;
      const match1 = lines[0].match(firstLineRegex);
      if (match1) {
        result.resolution = match1[1];
        const objectsRaw = match1[2];
        result.detectionTime = match1[3];
        result.objects = objectsRaw.split(',').map(item => {
          const parts = item.trim().split(' ');
          return { count: parts[0], type: parts.slice(1).join(' ') };
        });
      }
      const secondLineRegex = /^Speed:\s+([\d.]+ms)\s+preprocess,\s+([\d.]+ms)\s+inference,\s+([\d.]+ms)\s+postprocess per image at shape\s+(\(.*\))$/;
      const match2 = lines[1].match(secondLineRegex);
      if (match2) {
        result.preprocessSpeed = match2[1];
        result.inferenceSpeed = match2[2];
        result.postprocessSpeed = match2[3];
        result.imageShape = match2[4];
      }
      const thirdLineRegex = /^([\d.]+) - - \[([^\]]+)\] "([^"]+)" (\d+).*/;
      const match3 = lines[2].match(thirdLineRegex);
      if (match3) {
        result.ip = match3[1];
        result.timestamp = match3[2];
        result.request = match3[3];
        result.status = match3[4];
      }
    }
    return result;
  };

  const filteredLogs = logs.filter((log) => {
    const searchText = filter.toLowerCase();
    let detailsText = "";
    if (typeof log.details === 'string') {
      const parsed = parseDetectionLog(log.details);
      detailsText = Object.values(parsed).join(' ').toLowerCase();
    } else if (typeof log.details === 'object') {
      detailsText = JSON.stringify(log.details).toLowerCase();
    }
    return (
      (log.room_url && log.room_url.toLowerCase().includes(searchText)) ||
      (log.event_type && log.event_type.toLowerCase().includes(searchText)) ||
      (detailsText && detailsText.includes(searchText))
    );
  });

  const toggleExpandedLog = (id) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const closeModal = () => setSelectedAssignment(null);

  return (
    <div className="agent-dashboard">
      

      <div className="dashboard-content">
        <section className="streams-section">
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
        </section>

        <section className="logs-section">
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
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr>
                        <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                        <td>{log.room_url ? log.room_url.split('/').pop() : 'N/A'}</td>
                        <td>{log.event_type}</td>
                        <td>
                          {log.details && typeof log.details === 'string'
                            ? log.details.split('\n')[0]
                            : JSON.stringify(log.details)}
                        </td>
                        <td>
                          {log.details && (
                            <button className="details-button" onClick={() => toggleExpandedLog(log.id)}>
                              {expandedLogId === log.id ? 'Hide Details' : 'View Details'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedLogId === log.id && log.details && typeof log.details === 'string' && (
                        <tr className="expanded-log">
                          <td colSpan="5">
                            <div className="log-details">
                              {(() => {
                                const parsed = parseDetectionLog(log.details);
                                return parsed && Object.keys(parsed).length > 0 ? (
                                  <div>
                                    {parsed.resolution && (
                                      <p><strong>Resolution:</strong> {parsed.resolution}</p>
                                    )}
                                    {parsed.objects && (
                                      <p>
                                        <strong>Detected Objects:</strong>{' '}
                                        {parsed.objects.map((obj, idx) => (
                                          <span key={idx}>
                                            {obj.count} {obj.type}{idx < parsed.objects.length - 1 ? ', ' : ''}
                                          </span>
                                        ))}
                                      </p>
                                    )}
                                    {parsed.detectionTime && (
                                      <p><strong>Detection Time:</strong> {parsed.detectionTime}</p>
                                    )}
                                    {parsed.preprocessSpeed && (
                                      <p>
                                        <strong>Speed:</strong> Preprocess {parsed.preprocessSpeed}, Inference {parsed.inferenceSpeed}, Postprocess {parsed.postprocessSpeed}
                                      </p>
                                    )}
                                    {parsed.imageShape && (
                                      <p><strong>Image Shape:</strong> {parsed.imageShape}</p>
                                    )}
                                    {parsed.ip && (
                                      <p><strong>IP:</strong> {parsed.ip}</p>
                                    )}
                                    {parsed.timestamp && (
                                      <p><strong>Timestamp:</strong> {parsed.timestamp}</p>
                                    )}
                                    {parsed.request && (
                                      <p><strong>Request:</strong> {parsed.request}</p>
                                    )}
                                    {parsed.status && (
                                      <p><strong>Status:</strong> {parsed.status}</p>
                                    )}
                                  </div>
                                ) : (
                                  <p>{log.details}</p>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="no-logs">No detection events found</div>
            )}
          </div>
        </section>

        <section className="object-status">
          {objectDetectionActive ? (
            <p className="detection-active">Object Detection Active</p>
          ) : (
            <p className="detection-loading">Initializing Object Detection...</p>
          )}
        </section>
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
        /* Overall container and typography */
        .agent-dashboard {
          min-height: 100vh;
          background: #121212;
          color: #e0e0e0;
          font-family: 'Inter', sans-serif;
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* Navbar */
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

        /* Main dashboard content */
        .dashboard-content {
          max-width: 900px;
          margin: 40px auto;
          padding: 30px;
          background: #1a1a1a;
          border-radius: 15px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.5);
        }

        h2, h3 {
          margin-bottom: 1rem;
        }

        /* Streams Section */
        .streams-section {
          margin-bottom: 2rem;
        }
        .assignment-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
        }
        .assignment-card {
          background: #2d2d2d;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #3d3d3d;
          cursor: pointer;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .assignment-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
          border-color: #007bff;
        }
        .assignment-details {
          padding: 15px;
          background: #252525;
          text-align: center;
        }

        /* Logs Section */
        .logs-section {
          background: #1a1a1a;
          padding: 1.5rem;
          border-radius: 12px;
          margin-bottom: 2rem;
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
        .logs-table th, .logs-table td {
          padding: 0.8rem;
          border-bottom: 1px solid #3d3d3d;
          text-align: left;
        }
        .logs-table th {
          background: #007bff20;
          font-weight: 600;
        }
        .details-button {
          padding: 0.3rem 0.6rem;
          font-size: 0.9rem;
          background: #007bff;
          border: none;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        .details-button:hover {
          background: #0056b3;
        }
        .expanded-log {
          background: #1a1a1a;
        }
        .log-details p {
          margin: 0.3rem 0;
        }
        .loading, .no-logs {
          text-align: center;
          padding: 2rem;
          color: #a0a0a0;
        }

        /* Object detection status */
        .object-status {
          text-align: center;
          font-size: 1.1rem;
          margin-top: 1.5rem;
        }
        .detection-active {
          color: #28a745;
          font-weight: bold;
        }
        .detection-loading {
          color: #ffc107;
        }

        /* Modal styles */
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
          box-shadow: 0 15px 30px rgba(0,0,0,0.4);
        }
        .close-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: #ff4444;
          color: #fff;
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

        /* Animations */
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes zoomIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .nav-container {
            padding: 0 1rem;
          }
          .dashboard-content {
            margin: 20px auto;
            padding: 20px;
          }
          .assignment-grid {
            grid-template-columns: 1fr;
          }
          .logs-table th, .logs-table td {
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
