import React, { useState, useEffect } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';

const AgentDashboard = ({ onLogout }) => {
  // State initialization for dashboard, logs, and UI controls.
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, assignments: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);
  const [objectDetectionActive, setObjectDetectionActive] = useState(false);
  
  useEffect(() => {
    // Fetch agent session information
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

    // Fetch dashboard data (assigned streams and ongoing streams) and retrieve HLS URLs for each assignment
    const fetchDashboard = async () => {
      try {
        const res = await axios.get('/api/agent/dashboard');
        console.log('Agent dashboard data loaded:', res.data);
        const assignments = res.data.assignments || [];
        // For each assignment, fetch the m3u8 (HLS) URL
        const assignmentsWithHLS = await Promise.all(assignments.map(async (assignment) => {
          try {
            const hlsRes = await axios.get(`/api/stream/${assignment.streamer_uid}/hls`);
            return { ...assignment, m3u8_url: hlsRes.data.m3u8_url };
          } catch (err) {
            console.error(`Error fetching HLS URL for assignment ${assignment.id}:`, err);
            return { ...assignment, m3u8_url: null };
          }
        }));
        setDashboardData({ ...res.data, assignments: assignmentsWithHLS });
      } catch (error) {
        console.error('Error fetching agent dashboard data:', error);
      }
    };

    // Set up EventSource for real-time detection events
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

    // Initialize object detection if not active
    const initObjectDetection = () => {
      if (!objectDetectionActive) {
        console.log('Initializing object detection...');
        setObjectDetectionActive(true);
      }
    };

    // Initial API calls
    fetchAgentName();
    fetchDashboard();
    initObjectDetection();

    // Poll dashboard data every 10 seconds for updates
    const interval = setInterval(fetchDashboard, 10000);
    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [objectDetectionActive]);

  // Close the modal view for a selected assignment
  const closeModal = () => setSelectedAssignment(null);

  return (
    <div className="agent-dashboard">
      <div className="dashboard-content">
        <section className="streams-section">
          <h2>Assigned Streams</h2>
          <div className="assignment-grid">
            {dashboardData.assignments && dashboardData.assignments.length > 0 ? (
              dashboardData.assignments.map((assignment) => (
                <div 
                  key={assignment.id} 
                  className="assignment-card" 
                  onClick={() => setSelectedAssignment(assignment)}
                >
                  <VideoPlayer 
                    platform={assignment.platform.toLowerCase()}  // Same props as in admin panel
                    streamerUid={assignment.streamer_uid}
                    streamerName={assignment.streamer_username}
                    alerts={detectionAlerts[assignment.room_url] || []}
                    thumbnail={true}
                    hlsUrl={assignment.m3u8_url}  // Pass the fetched HLS URL to render the video via HLSPlayer
                  />
                  <div className="assignment-details">
                    <p><strong>{assignment.streamer_username}</strong></p>
                    <p><small>{assignment.platform}</small></p>
                  </div>
                </div>
              ))
            ) : (
              <p>No assigned streams found.</p>
            )}
          </div>
        </section>
      </div>

      {selectedAssignment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeModal}>×</button>
            <h2>{selectedAssignment.streamer_username}'s Stream</h2>
            <VideoPlayer 
              platform={selectedAssignment.platform.toLowerCase()}
              streamerUid={selectedAssignment.streamer_uid}
              streamerName={selectedAssignment.streamer_username}
              staticThumbnail={selectedAssignment.static_thumbnail}
              alerts={detectionAlerts[selectedAssignment.room_url] || []}
              hlsUrl={selectedAssignment.m3u8_url}  // Pass HLS URL in modal view as well
            />
            <div className="stream-info">
              <p><strong>Platform:</strong> {selectedAssignment.platform}</p>
              <p><strong>URL:</strong> {selectedAssignment.room_url}</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Overall container and typography */
        .agent-dashboard {
          min-height: 100vh;
          background: linear-gradient(135deg, #121212, #1a1a1a);
          color: #e0e0e0;
          font-family: 'Inter', sans-serif;
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
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
          .dashboard-content {
            margin: 20px auto;
            padding: 20px;
          }
          .assignment-grid {
            grid-template-columns: 1fr;
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
