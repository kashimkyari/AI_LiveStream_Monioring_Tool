import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Hls from 'hls.js';

const AgentDashboard = ({ onLogout }) => {
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, assignments: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState('');
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);

  // Video player states
  const videoRefs = useRef({});
  const hlsInstances = useRef({});
  const [streamStates, setStreamStates] = useState({});

  // Fetch agent session information and assigned streams
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch session data
        const sessionRes = await axios.get('/api/session');
        if (sessionRes.data.logged_in) {
          setAgentName(`${sessionRes.data.user.firstname} ${sessionRes.data.user.lastname}`);
        }
        
        // Fetch assigned streams
        const dashboardRes = await axios.get('/api/agent/dashboard');
        console.log('Assigned streams:', dashboardRes.data);
        
        const assignments = dashboardRes.data.assignments || [];
        
        // Initialize stream states for each assignment
        const initialStreamStates = {};
        assignments.forEach(assignment => {
          initialStreamStates[assignment.id] = {
            isStreamLoaded: false,
            isLoadingStream: true,
            hasError: false,
            errorMessage: "",
            isStreamOnline: false,
            isMuted: true,
            volume: 0
          };
        });
        
        setStreamStates(initialStreamStates);
        setDashboardData({
          ongoing_streams: dashboardRes.data.ongoing_streams,
          assignments: assignments
        });
        setLoading(false);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setLoading(false);
      }
    };

    fetchInitialData();

    // Set up EventSource for real-time detection events
    const eventSource = new EventSource('/api/detection-events');
    
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (!data.error) {
        setDetectionAlerts(prev => ({
          ...prev,
          [data.stream_url]: data.detections
        }));

        if (data.detections?.length > 0 && Date.now() - lastNotification > 60000) {
          const detectedItems = data.detections.map(d => d.class).join(', ');
          if (Notification.permission === 'granted') {
            new Notification('Object Detected', {
              body: `Detected ${detectedItems} in ${data.stream_url}`
            });
            setLastNotification(Date.now());
          }
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      eventSource.close();
    };

    return () => {
      // Clean up HLS instances
      Object.values(hlsInstances.current).forEach(hls => {
        if (hls) hls.destroy();
      });
      
      eventSource.close();
    };
  }, [lastNotification]);

  // Initialize HLS player for a specific assignment
  const initializePlayer = (assignment, videoElement) => {
    if (!videoElement) return;

    const assignmentId = assignment.id;
    
    // Cleanup existing HLS instance if any
    if (hlsInstances.current[assignmentId]) {
      hlsInstances.current[assignmentId].destroy();
      delete hlsInstances.current[assignmentId];
    }

    // Determine the m3u8 URL based on the platform
    const m3u8Url = assignment.platform.toLowerCase() === 'chaturbate'
      ? assignment.chaturbate_m3u8_url
      : assignment.stripchat_m3u8_url;

    if (!m3u8Url) {
      setStreamStates(prev => ({
        ...prev,
        [assignmentId]: {
          ...prev[assignmentId],
          isLoadingStream: false,
          hasError: true,
          errorMessage: "Invalid stream URL",
          isStreamOnline: false
        }
      }));
      return;
    }

    // Create new HLS instance
    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, startLevel: -1, debug: false });
      
      hls.loadSource(m3u8Url);
      hls.attachMedia(videoElement);
      hlsInstances.current[assignmentId] = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamStates(prev => ({
          ...prev,
          [assignmentId]: {
            ...prev[assignmentId],
            isLoadingStream: false,
            isStreamLoaded: true,
            isStreamOnline: true
          }
        }));
        videoElement.play().catch(console.error);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          setStreamStates(prev => ({
            ...prev,
            [assignmentId]: {
              ...prev[assignmentId],
              isLoadingStream: false,
              hasError: true,
              isStreamOnline: false,
              errorMessage: data.details || 'Playback error'
            }
          }));
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari
      videoElement.src = m3u8Url;
      videoElement.addEventListener('loadedmetadata', () => {
        setStreamStates(prev => ({
          ...prev,
          [assignmentId]: {
            ...prev[assignmentId],
            isLoadingStream: false,
            isStreamLoaded: true,
            isStreamOnline: true
          }
        }));
        videoElement.play().catch(console.error);
      });
      
      videoElement.addEventListener('error', () => {
        setStreamStates(prev => ({
          ...prev,
          [assignmentId]: {
            ...prev[assignmentId],
            isLoadingStream: false,
            hasError: true,
            isStreamOnline: false,
            errorMessage: "Playback error"
          }
        }));
      });
    } else {
      setStreamStates(prev => ({
        ...prev,
        [assignmentId]: {
          ...prev[assignmentId],
          isLoadingStream: false,
          hasError: true,
          isStreamOnline: false,
          errorMessage: "HLS not supported"
        }
      }));
    }
  };

  // Handle reference for video elements
  const handleVideoRef = (element, assignmentId) => {
    if (element && !videoRefs.current[assignmentId]) {
      videoRefs.current[assignmentId] = element;
      
      const assignment = dashboardData.assignments.find(a => a.id === assignmentId);
      if (assignment) {
        initializePlayer(assignment, element);
      }
    }
  };

  // Toggle mute for a specific stream
  const toggleMute = (assignmentId) => {
    setStreamStates(prev => {
      const currentState = prev[assignmentId];
      const newMutedState = !currentState.isMuted;
      
      if (videoRefs.current[assignmentId]) {
        videoRefs.current[assignmentId].muted = newMutedState;
        if (!newMutedState) {
          videoRefs.current[assignmentId].volume = currentState.volume > 0 ? currentState.volume : 0.5;
        }
      }
      
      return {
        ...prev,
        [assignmentId]: {
          ...currentState,
          isMuted: newMutedState,
          volume: newMutedState ? 0 : (currentState.volume > 0 ? currentState.volume : 0.5)
        }
      };
    });
  };

  // Set volume for a specific stream
  const setStreamVolume = (assignmentId, newVolume) => {
    setStreamStates(prev => {
      const currentState = prev[assignmentId];
      
      if (videoRefs.current[assignmentId]) {
        videoRefs.current[assignmentId].volume = newVolume;
        videoRefs.current[assignmentId].muted = newVolume === 0;
      }
      
      return {
        ...prev,
        [assignmentId]: {
          ...currentState,
          volume: newVolume,
          isMuted: newVolume === 0
        }
      };
    });
  };

  const closeModal = () => setSelectedAssignment(null);

  // Function to render stream video with controls and status indicators
  const renderStreamVideo = (assignment, isModal = false) => {
    const assignmentId = assignment.id;
    const streamState = streamStates[assignmentId] || {
      isStreamLoaded: false,
      isLoadingStream: true,
      hasError: false,
      errorMessage: "",
      isStreamOnline: false,
      isMuted: true,
      volume: 0
    };
    
    return (
      <div className="video-container">
        <video
          ref={(el) => handleVideoRef(el, assignmentId)}
          muted={streamState.isMuted}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        />
        
        {streamState.isStreamLoaded && streamState.isStreamOnline && (
          <div className="live-indicator">
            <div className="red-dot"></div>
            <span className="live-text">LIVE</span>
          </div>
        )}
        
        {streamState.isLoadingStream && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <div className="loading-text">Loading stream...</div>
          </div>
        )}
        
        {streamState.hasError && (
          <div className="error-overlay">
            <div className="error-icon">⚠️</div>
            <div className="error-text">{streamState.errorMessage}</div>
          </div>
        )}
        
        {!streamState.isStreamOnline && !streamState.isLoadingStream && (
          <div className="offline-message">
            <span>Offline</span>
          </div>
        )}
        
        {isModal && (
          <div className="volume-controls">
            <button 
              className="mute-button"
              onClick={() => toggleMute(assignmentId)}
            >
              {streamState.isMuted ? '🔇' : streamState.volume > 0 ? '🔊' : '🔈'}
            </button>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="1"
              step="0.1"
              value={streamState.volume}
              onChange={(e) => setStreamVolume(assignmentId, parseFloat(e.target.value))}
            />
          </div>
        )}
      </div>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <div className="agent-dashboard">
        <div className="loading-page">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading dashboard...</div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="agent-dashboard">
      <div className="dashboard-content">
        <h1>Welcome, {agentName}</h1>
        <section className="streams-section">
          <h2>Assigned Streams ({dashboardData.ongoing_streams})</h2>
          <div className="assignment-grid">
            {dashboardData.assignments.length > 0 ? (
              dashboardData.assignments.map((assignment) => (
                <div 
                  key={assignment.id} 
                  className="assignment-card" 
                  onClick={() => setSelectedAssignment(assignment)}
                >
                  {renderStreamVideo(assignment)}
                  
                  {(detectionAlerts[assignment.room_url]?.length > 0) && (
                    <div className="detection-alert-badge">
                      {detectionAlerts[assignment.room_url].length} DETECTIONS
                      <div className="detection-preview">
                        <img 
                          src={detectionAlerts[assignment.room_url][0].image_url} 
                          alt="Detection preview" 
                          className="preview-image"
                        />
                        <div className="detection-info">
                          <span>{detectionAlerts[assignment.room_url][0].class} </span>
                          <span>({(detectionAlerts[assignment.room_url][0].confidence * 100).toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="assignment-details">
                    <p><strong>Streamer:</strong> {assignment.streamer_username}</p>
                    <p><strong>Platform:</strong> {assignment.platform}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="no-streams-message">No assigned streams found.</p>
            )}
          </div>
        </section>
      </div>

      {selectedAssignment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeModal}>×</button>
            <h2>{selectedAssignment.streamer_username}'s Stream</h2>
            
            {renderStreamVideo(selectedAssignment, true)}
            
            <div className="stream-info">
              <p><strong>Platform:</strong> {selectedAssignment.platform}</p>
              <p><strong>URL:</strong> {selectedAssignment.room_url}</p>
              {detectionAlerts[selectedAssignment.room_url]?.length > 0 && (
                <div className="detections-list">
                  <h3>Recent Detections</h3>
                  <ul>
                    {detectionAlerts[selectedAssignment.room_url].map((detection, index) => (
                      <li key={index}>
                        {detection.class} ({(detection.confidence * 100).toFixed(1)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
};

// CSS styles
const styles = `
  .agent-dashboard {
    min-height: 100vh;
    background: linear-gradient(135deg, #121212, #1a1a1a);
    color: #e0e0e0;
    font-family: 'Inter', sans-serif;
    animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .dashboard-content {
    max-width: 1200px;
    margin: 40px auto;
    padding: 30px;
    background: #1a1a1a;
    border-radius: 15px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  }

  h1 {
    margin-bottom: 2rem;
    font-size: 2rem;
    color: #fff;
    border-bottom: 1px solid #333;
    padding-bottom: 1rem;
  }

  h2, h3 {
    margin-bottom: 1rem;
  }

  .streams-section {
    margin-bottom: 2rem;
  }

  .assignment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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

  .detection-preview {
    position: absolute;
    display: none;
    right: 0;
    top: 100%;
    background: #333;
    border-radius: 8px;
    padding: 10px;
    width: 180px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
    z-index: 3;
  }

  .detection-alert-badge:hover .detection-preview {
    display: block;
  }

  .preview-image {
    width: 100%;
    border-radius: 4px;
    margin-bottom: 8px;
  }

  .detection-info {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
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
    max-width: 800px;
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

  .detections-list {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #333;
  }

  .detections-list ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .detections-list li {
    margin-bottom: 0.5rem;
  }

  .video-container {
    position: relative;
    width: 100%;
    height: 0;
    padding-top: 56.25%;
    overflow: hidden;
    background: #000;
    border-radius: 8px;
  }

  .live-indicator {
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.7);
    padding: 4px 8px;
    border-radius: 4px;
    z-index: 10;
    color: white;
  }

  .red-dot {
    width: 8px;
    height: 8px;
    background: #ff0000;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }

  .loading-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
  }

  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    z-index: 5;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 4px solid white;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    color: white;
    margin-top: 10px;
    font-size: 14px;
  }

  .error-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    z-index: 5;
    color: white;
  }

  .error-icon {
    font-size: 32px;
    margin-bottom: 10px;
  }

  .error-text {
    text-align: center;
    max-width: 80%;
  }

  .volume-controls {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.7);
    padding: 8px;
    border-radius: 20px;
    z-index: 10;
  }

  .mute-button {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    font-size: 20px;
    padding: 0;
  }

  .volume-slider {
    width: 80px;
    height: 4px;
    accent-color: white;
  }

  .offline-message {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
  }

  .no-streams-message {
    grid-column: 1 / -1;
    text-align: center;
    padding: 2rem;
    background: #252525;
    border-radius: 8px;
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes zoomIn {
    from { transform: scale(0.8); opacity: 0; }
    to { transform: scale(1); opacity: 1); }
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
      width: 95%;
    }
  }
`;

export default AgentDashboard;