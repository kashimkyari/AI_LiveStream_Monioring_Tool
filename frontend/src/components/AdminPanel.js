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
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, streams: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get('/api/dashboard');
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  useEffect(() => {
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

    return () => eventSource.close();
  }, [lastNotification]);

  useEffect(() => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboard();
      const interval = setInterval(fetchDashboard, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const closeModal = () => setSelectedAssignment(null);


  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="tab-content">
            <h3></h3>
            <div className="dashboard-info">
              <p><strong>Ongoing Streams:</strong> {dashboardData.ongoing_streams}</p>
              <div className="assignment-grid">
                {dashboardData.streams.map((stream) => (
                  <div key={stream.id} className="assignment-card" onClick={() => setSelectedAssignment(stream)}>
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
          <Suspense fallback={<LoadingFallback />}>
            <AssignmentPage />
          </Suspense>
        );
      case 'streams':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <StreamsPage />
          </Suspense>
        );
      case 'flag':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <FlagSettingsPage />
          </Suspense>
        );
      case 'agents':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <AgentsPage />
          </Suspense>
        );
      case 'scraper':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <div className="tab-content">
              <h3>Scraper</h3>
              <ScraperPage />
            </div>
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
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
          margin: 40px auto;
          padding: 30px;
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

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dashboard-info {
          margin: 25px 0;
        }

        .assignment-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
          width: 200px;
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

        @media (max-width: 768px) {
          .admin-panel {
            margin: 20px;
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminPanel;