import React, { useState, useEffect, lazy, Suspense } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';

// Lazy load components
const ScraperPage = lazy(() => import('./ScraperPage'));
const VisualTestPage = lazy(() => import('./VisualTestPage'));
const AssignmentPage = lazy(() => import('./AssignmentPage'));
const StreamsPage = lazy(() => import('./StreamsPage'));
const FlagSettingsPage = lazy(() => import('./FlagSettingsPage'));
const AgentsPage = lazy(() => import('./AgentsPage'));

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("AdminPanel Error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h3>Something went wrong.</h3>
          <p>Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()}>Refresh</button>
          <style jsx>{`
            .error-container {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 200px;
              color: #e0e0e0;
              background: #2a2a2a;
              border-radius: 8px;
              padding: 20px;
            }
            button {
              background: #007bff;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 4px;
              margin-top: 10px;
              cursor: pointer;
            }
          `}</style>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading fallback component
const LoadingFallback = () => (
  <div className="loading-container">
    <p>Loading...</p>
    <style jsx>{`
      .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 200px;
        color: #e0e0e0;
      }
    `}</style>
  </div>
);

const AdminPanel = ({ activeTab }) => {
  console.log("Rendering AdminPanel with tab:", activeTab);
  
  // Safe state initializations - no window references
  const [isMobile, setIsMobile] = useState(false);
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, streams: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);
  const [hasError, setHasError] = useState(false);

  // Detect mobile only after component mounts
  useEffect(() => {
    try {
      setIsMobile(window.innerWidth <= 768);
      const checkMobile = () => setIsMobile(window.innerWidth <= 768);
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    } catch (error) {
      console.error("Mobile detection error:", error);
      setHasError(true);
    }
  }, []);

  // Component lifecycle logging
  useEffect(() => {
    console.log("AdminPanel mounted");
    return () => console.log("AdminPanel unmounted");
  }, []);

  // Tab change logging
  useEffect(() => {
    console.log("Active tab changed to:", activeTab);
  }, [activeTab]);

  const fetchDashboard = async () => {
    try {
      console.log("Fetching dashboard data...");
      const res = await axios.get('/api/dashboard');
      console.log("Dashboard data received:", res.data);
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setHasError(true);
    }
  };

  // EventSource with better error handling and compatibility check
  useEffect(() => {
    let eventSource = null;
    
    try {
      if (typeof window === 'undefined' || !window.EventSource) {
        console.log("EventSource not supported, using fallback polling");
        // Implement fallback polling here if needed
        return;
      }
      
      console.log("Setting up EventSource connection...");
      eventSource = new EventSource('/api/detection-events');
      
      eventSource.onopen = () => {
        console.log("EventSource connection established");
      };
      
      eventSource.onmessage = (e) => {
        try {
          console.log("EventSource message received");
          const data = JSON.parse(e.data);
          if (!data.error) {
            setDetectionAlerts(prev => ({
              ...prev,
              [data.stream_url]: data.detections
            }));

            if (data.detections?.length > 0) {
              handleNotification(data);
            }
          }
        } catch (error) {
          console.error("Error processing EventSource message:", error);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("Attempting to reconnect EventSource in 5 seconds...");
          setTimeout(() => {
            try {
              eventSource = new EventSource('/api/detection-events');
            } catch (reconnectError) {
              console.error("EventSource reconnection failed:", reconnectError);
            }
          }, 5000);
        }
      };
    } catch (error) {
      console.error("EventSource setup error:", error);
    }

    return () => {
      if (eventSource) {
        console.log("Closing EventSource connection");
        eventSource.close();
      }
    };
  }, []);

  // Safely handle notifications
  const handleNotification = (data) => {
    try {
      if (typeof window !== 'undefined' && 
          'Notification' in window && 
          Notification.permission === 'granted' && 
          Date.now() - lastNotification > 60000) {
        
        const detectedItems = data.detections.map(d => d.class).join(', ');
        new Notification('Object Detected', {
          body: `Detected ${detectedItems} in ${data.stream_url}`
        });
        setLastNotification(Date.now());
      }
    } catch (err) {
      console.error("Notification error:", err);
    }
  };

  // Notification permission request with better error handling
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted') {
          Notification.requestPermission().catch(err => 
            console.error("Notification permission error:", err)
          );
        }
      }
    } catch (error) {
      console.error("Notification setup error:", error);
    }
  }, []);

  // Dashboard data fetching with cleanup
  useEffect(() => {
    let isMounted = true;
    let interval = null;
    
    if (activeTab === 'dashboard') {
      fetchDashboard();
      interval = setInterval(() => {
        if (isMounted) {
          fetchDashboard();
        }
      }, 10000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      isMounted = false;
    };
  }, [activeTab]);

  const closeModal = () => setSelectedAssignment(null);

  // Error state UI
  if (hasError) {
    return (
      <div className="admin-panel error-state">
        <h3>Something went wrong</h3>
        <p>There was an error loading the admin panel. Please try refreshing the page.</p>
        <button onClick={() => window.location.reload()}>Refresh Page</button>
        <style jsx>{`
          .admin-panel.error-state {
            max-width: 900px;
            margin: 40px auto;
            padding: 30px;
            background: #1a1a1a;
            border-radius: 15px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            font-family: 'Inter', sans-serif;
            color: #e0e0e0;
            text-align: center;
          }
          button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            margin-top: 20px;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  const renderTabContent = () => {
    try {
      switch (activeTab) {
        case 'dashboard':
          return (
            <div className="tab-content">
              <h3>Dashboard</h3>
              <div className="dashboard-info">
                <p><strong>Ongoing Streams:</strong> {dashboardData.ongoing_streams}</p>
                <div className="assignment-grid">
                  {dashboardData.streams.map((stream) => (
                    <div
                      key={stream.id}
                      className="assignment-card"
                      onClick={() => setSelectedAssignment(stream)}
                    >
                      <VideoPlayer
                        platform={stream.platform.toLowerCase()}
                        streamerUid={stream.streamer_uid}
                        streamerName={stream.streamer_username}
                        alerts={detectionAlerts[stream.room_url] || []}
                      />
                      {(detectionAlerts[stream.room_url]?.length > 0) && (
                        <div className="detection-alert-badge">
                          {detectionAlerts[stream.room_url].length} DETECTIONS
                          <div className="detection-preview">
                            <img 
                              src={detectionAlerts[stream.room_url][0].image_url} 
                              alt="Detection preview" 
                              className="preview-image"
                            />
                            <div className="detection-info">
                              <span>{detectionAlerts[stream.room_url][0].class} </span>
                              <span>({(detectionAlerts[stream.room_url][0].confidence * 100).toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="assignment-details">
                        <p><strong>Stream:</strong> {stream.id}</p>
                        <p><strong>Agent:</strong> {stream.agent?.username || 'Unassigned'}</p>
                        <p><strong>Model:</strong> {stream.streamer_username}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        case 'assign':
          return (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <AssignmentPage />
              </Suspense>
            </ErrorBoundary>
          );
        case 'streams':
          return (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <StreamsPage />
              </Suspense>
            </ErrorBoundary>
          );
        case 'flag':
          return (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <FlagSettingsPage />
              </Suspense>
            </ErrorBoundary>
          );
        case 'agents':
          return (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <AgentsPage />
              </Suspense>
            </ErrorBoundary>
          );
        case 'scraper':
          return (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <div className="tab-content">
                  <h3>Scraper</h3>
                  <ScraperPage />
                </div>
              </Suspense>
            </ErrorBoundary>
          );
        default:
          return <div className="tab-content">Please select a tab</div>;
      }
    } catch (error) {
      console.error("Error rendering tab content:", error);
      return (
        <div className="tab-content error">
          <h3>Error Loading Content</h3>
          <p>There was a problem loading this tab. Please try another tab or refresh the page.</p>
        </div>
      );
    }
  };

  return (
    <ErrorBoundary>
      <div className="admin-panel">
        {renderTabContent()}

        {selectedAssignment && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="close-button" onClick={closeModal}>X</button>
              <h3>Stream Details</h3>
              <p><strong>Stream ID:</strong> {selectedAssignment.id}</p>
              <p><strong>Agent:</strong> {selectedAssignment.agent?.username || 'Unassigned'}</p>
              <p><strong>Platform:</strong> {selectedAssignment.platform}</p>
              <p><strong>Streamer:</strong> {selectedAssignment.streamer_username}</p>
              <VideoPlayer 
                platform={selectedAssignment.platform.toLowerCase()}
                streamerUid={selectedAssignment.streamer_uid}
                streamerName={selectedAssignment.streamer_username}
                staticThumbnail={selectedAssignment.static_thumbnail}
                alerts={detectionAlerts[selectedAssignment.room_url] || []}
              />
            </div>
          </div>
        )}

        <style jsx>{`
          .admin-panel {
            max-width: 900px;
            margin: ${isMobile ? '20px auto' : '40px auto'};
            padding: ${isMobile ? '20px' : '30px'};
            background: #1a1a1a;
            border-radius: 15px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            font-family: 'Inter', sans-serif;
            animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
            color: #e0e0e0;
            border: 1px solid #2d2d2d;
          }

          .tab-content {
            margin-top: 25px;
            animation: fadeIn 0.4s ease;
          }

          .tab-content.error {
            background: rgba(255, 0, 0, 0.1);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 0, 0, 0.3);
          }

          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .dashboard-info {
            margin: 25px 0;
          }

          .assignment-grid {
            display: grid;
            grid-template-columns: ${isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))'};
            gap: 20px;
            margin-top: 20px;
          }

          .assignment-card {
            background: #2d2d2d;
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid #3d3d3d;
            cursor: pointer;
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
            backdrop-filter: blur(5px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
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

          .detection-preview {
            position: absolute;
            top: 100%;
            right: 0;
            width: ${isMobile ? '150px' : '200px'};
            background: #2d2d2d;
            border-radius: 8px;
            padding: 8px;
            display: none;
            z-index: 1000;
          }

          .detection-alert-badge:hover .detection-preview {
            display: block;
          }

          .preview-image {
            width: 100%;
            border-radius: 4px;
            margin-bottom: 4px;
          }

          .detection-info {
            font-size: 0.8em;
            text-align: center;
          }

          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @media (max-width: 768px) {
            .admin-panel {
              margin: 20px;
              padding: 20px;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
};

export default AdminPanel;