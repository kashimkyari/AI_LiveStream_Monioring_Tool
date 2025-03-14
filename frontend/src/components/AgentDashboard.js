import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Hls from 'hls.js'; // HLS library for m3u8 streams

// HLSPlayer component to play m3u8 streams directly.
// Security Note: Ensure the stream URL is sanitized if sourced from user input.
const HLSPlayer = ({ src, poster, alerts, className }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    let hls;
    const video = videoRef.current;

    if (video) {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (e.g., Safari)
        video.src = src;
      } else {
        console.error('HLS not supported in this browser');
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

  return (
    <video 
      ref={videoRef} 
      controls 
      poster={poster}
      className={className}
      style={{ width: '100%', height: 'auto', borderRadius: '4px' }}
    />
  );
};

const AgentDashboard = ({ onLogout }) => {
  // State for dashboard data, selected assignment, agent info, detection alerts, etc.
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, assignments: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [agentName, setAgentName] = useState('');
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);
  const [objectDetectionActive, setObjectDetectionActive] = useState(false);

  useEffect(() => {
    // Fetch the agent session info.
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

    // Fetch dashboard data: assigned streams and ongoing streams.
    const fetchDashboard = async () => {
      try {
        const res = await axios.get('/api/agent/dashboard');
        console.log('Agent dashboard data loaded:', res.data);
        setDashboardData(res.data);
      } catch (error) {
        console.error('Error fetching agent dashboard data:', error);
      }
    };

    // Set up real-time detection alerts via EventSource.
    const eventSource = new EventSource('/api/detection-events');
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setDetectionAlerts(prev => ({
        ...prev,
        [data.stream_url]: data.detections
      }));

      // Trigger notifications (throttled to once per minute)
      if (data.detections?.length > 0 && Date.now() - lastNotification > 60000) {
        const detectedItems = data.detections.map(d => d.class).join(', ');
        if (Notification.permission === 'granted') {
          new Notification('Object Detected', {
            body: `Detected ${detectedItems} in ${data.stream_url}`
          });
          setLastNotification(Date.now());
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      eventSource.close();
    };

    // Initialize object detection if not already active.
    const initObjectDetection = () => {
      if (!objectDetectionActive) {
        console.log('Initializing object detection...');
        setObjectDetectionActive(true);
      }
    };

    // Initial API calls.
    fetchAgentName();
    fetchDashboard();
    initObjectDetection();

    // Poll dashboard data every 10 seconds.
    const interval = setInterval(fetchDashboard, 10000);
    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [objectDetectionActive, lastNotification]);

  // Close the modal view.
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
                  {/* HLSPlayer is used to preview the stream */}
                  <HLSPlayer 
                    src={assignment.stream_url}  // Expecting an m3u8 URL
                    poster={assignment.static_thumbnail}
                    className="video-preview"
                  />
                  {detectionAlerts[assignment.room_url] && detectionAlerts[assignment.room_url].length > 0 && (
                    <div className="detection-alert-badge">
                      {detectionAlerts[assignment.room_url].length} DETECTIONS
                    </div>
                  )}
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
            <HLSPlayer 
              src={selectedAssignment.stream_url} 
              poster={selectedAssignment.static_thumbnail}
              className="modal-video-player"
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
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
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
          position: relative;
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
        .video-preview {
          width: 100%;
          height: 150px;
          object-fit: cover;
        }
        .detection-alert-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #ff4444;
          color: white;
          padding: 5px 10px;
          border-radius: 15px;
          font-size: 0.8rem;
          font-weight: bold;
          animation: pulse 1s infinite;
          z-index: 2;
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
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
          padding: 20px;
          border-radius: 8px;
          max-width: 600px;
          width: 90%;
          position: relative;
          animation: zoomIn 0.3s ease;
          border: 1px solid #3d3d3d;
          box-shadow: 0 15px 30px rgba(0,0,0,0.4);
        }
        @keyframes zoomIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .close-button {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #ff4444;
          color: #fff;
          border: none;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          cursor: pointer;
          font-weight: bold;
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
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
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
