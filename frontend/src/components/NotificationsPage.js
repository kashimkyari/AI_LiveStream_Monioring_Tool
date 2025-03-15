import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const NotificationsPage = () => {
  // Component states
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedNotification, setSelectedNotification] = useState(null);

  // Fetch notifications with the current filter
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`/api/notifications?filter=${filter}`);
      if (res.status === 200) {
        // Enhance each notification with its details for easier access
        const notificationsData = res.data.map(notification => ({
          ...notification,
          details: {
            ...notification.details,
            annotated_image: notification.details.annotated_image,
            captured_image: notification.details.captured_image,
            streamer_uid: notification.details.streamer_uid,
            streamer_name: notification.details.streamer_name,
            assigned_agent: notification.details.assigned_agent,
            platform: notification.details.platform,
            detected_object: notification.details.detected_object,
            detections: notification.details.detections,
            keyword: notification.details.keyword,
          },
        }));
        setNotifications(notificationsData);
      } else {
        setError('Failed to load notifications. Please try again.');
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Poll notifications on mount and every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Mark a single notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/read`);
      setNotifications(prev =>
        prev.map(notification =>
          notification.id === notificationId ? { ...notification, read: true } : notification
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      setNotifications(prev =>
        prev.map(notification => ({ ...notification, read: true }))
      );
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  // Delete a single notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await axios.delete(`/api/notifications/${notificationId}`);
      setNotifications(prev =>
        prev.filter(notification => notification.id !== notificationId)
      );
      if (selectedNotification && selectedNotification.id === notificationId) {
        setSelectedNotification(null);
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }, [selectedNotification]);

  // Delete all notifications
  const deleteAllNotifications = async () => {
    try {
      await axios.delete('/api/notifications/delete-all');
      setNotifications([]);
      setSelectedNotification(null);
    } catch (err) {
      console.error('Error deleting all notifications:', err);
    }
  };

  // Handle click on a notification item
  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    setSelectedNotification(notification);
  };

  // Format confidence score as a percentage string
  const formatConfidence = (confidence) => {
    if (typeof confidence === 'number') {
      return `${(confidence * 100).toFixed(1)}%`;
    }
    return 'N/A';
  };

  // Get color based on confidence level for badge styling
  const getConfidenceColor = (confidence) => {
    const confidenceValue = typeof confidence === 'number' ? confidence : 0;
    if (confidenceValue >= 0.9) return '#ff4444';
    if (confidenceValue >= 0.75) return '#ff8c00';
    if (confidenceValue >= 0.5) return '#ffcc00';
    return '#28a745';
  };

  // Render the details pane for a selected notification
  const renderNotificationDetails = () => {
    if (!selectedNotification) {
      return (
        <div className="empty-detail">
          <div className="empty-icon">📋</div>
          <p>Select a notification to view details</p>
        </div>
      );
    }

    // Common header for both audio and object detection details
    const commonHeader = (
      <div className="detail-header">
        <h3>
          {selectedNotification.type === 'audio_detection'
            ? 'Audio Detection Details'
            : 'Detection Details'}
        </h3>
        <div className="detail-actions">
          {!selectedNotification.read && (
            <button
              className="mark-read-btn"
              onClick={() => markAsRead(selectedNotification.id)}
            >
              Mark as Read
            </button>
          )}
          <button
            className="delete-btn"
            onClick={() => deleteNotification(selectedNotification.id)}
          >
            Delete
          </button>
        </div>
      </div>
    );

    const commonTimestamp = (
      <div className="detail-timestamp">
        Detected at: {new Date(selectedNotification.timestamp).toLocaleString()}
      </div>
    );

    if (selectedNotification.type === 'audio_detection') {
      return (
        <div className="notification-detail">
          {commonHeader}
          {commonTimestamp}
          <div className="audio-detection-content">
            <p>
              Detected keyword: <strong>{selectedNotification.details?.keyword}</strong>
            </p>
          </div>
        </div>
      );
    }

    if (selectedNotification.type === 'object_detection') {
      return (
        <div className="notification-detail">
          {commonHeader}
          {commonTimestamp}
          <div className="detection-content">
            <div className="image-gallery">
              {selectedNotification.details?.annotated_image && (
                <div className="image-card">
                  <img
                    src={selectedNotification.details.annotated_image}
                    alt="Annotated Detection"
                    className="detection-image"
                  />
                  <div className="image-label">Annotated Image</div>
                </div>
              )}
              {selectedNotification.details?.captured_image && (
                <div className="image-card">
                  <img
                    src={selectedNotification.details.captured_image}
                    alt="Captured Image"
                    className="detection-image"
                  />
                  <div className="image-label">Captured Image</div>
                </div>
              )}
            </div>
            <div className="streamer-info-card">
              <h4>Streamer Information</h4>
              <div className="info-item">
                <span className="info-label">Streamer UID:</span>
                <span className="info-value">{selectedNotification.details?.streamer_uid}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Streamer Name:</span>
                <span className="info-value">{selectedNotification.details?.streamer_name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Assigned Agent:</span>
                <span className="info-value">{selectedNotification.details?.assigned_agent}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Platform:</span>
                <span className="info-value">{selectedNotification.details?.platform}</span>
              </div>
            </div>
            <div className="detected-objects">
              <h4>Detected Objects</h4>
              {selectedNotification.details?.detections?.map((detection, index) => (
                <div key={index} className="detection-item">
                  <span className="detection-class">{detection.class}</span>
                  <span
                    className="confidence-badge"
                    style={{ backgroundColor: getConfidenceColor(detection.score) }}
                  >
                    {formatConfidence(detection.score)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="notifications-page">
      <div className="notifications-controls">
        <div className="filter-controls">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread
          </button>
          <button
            className={`filter-btn ${filter === 'detection' ? 'active' : ''}`}
            onClick={() => setFilter('detection')}
          >
            Detections
          </button>
        </div>
        <div className="action-controls">
          <button
            className="mark-all-read"
            onClick={markAllAsRead}
            disabled={notifications.filter(n => !n.read).length === 0}
          >
            Mark All as Read
          </button>
          <button
            className="delete-all"
            onClick={deleteAllNotifications}
            disabled={notifications.length === 0}
          >
            Delete All
          </button>
        </div>
      </div>

      <div className="notifications-container">
        <div className="notifications-list-container">
          <h3>Notifications ({notifications.length})</h3>
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading notifications...</p>
            </div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔔</div>
              <p>No notifications to display</p>
            </div>
          ) : (
            <div className="notifications-list">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? 'read' : 'unread'} ${
                    selectedNotification && selectedNotification.id === notification.id ? 'selected' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div
                    className="notification-indicator"
                    style={{
                      backgroundColor:
                        notification.type === 'object_detection'
                          ? getConfidenceColor(notification.details?.detections?.[0]?.score)
                          : notification.type === 'audio_detection'
                          ? '#007bff'
                          : '#28a745',
                    }}
                  ></div>
                  <div className="notification-content">
                    <div className="notification-message">
                      {notification.type === 'object_detection'
                        ? `Detected ${notification.details?.detections?.length || 0} objects`
                        : notification.type === 'audio_detection'
                        ? `Detected keyword: ${notification.details?.keyword}`
                        : notification.type === 'video_notification'
                        ? notification.details?.message || 'Video event occurred'
                        : notification.message}
                    </div>
                    <div className="notification-meta">
                      <span className="notification-time">
                        {new Date(notification.timestamp).toLocaleString()}
                      </span>
                      {notification.type === 'object_detection' && (
                        <span className="notification-confidence">
                          {formatConfidence(notification.details?.detections?.[0]?.score)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="notification-detail-container">
          {renderNotificationDetails()}
        </div>
      </div>

      <style jsx>{`
        .notifications-page {
          background: #1a1a1a;
          border-radius: 8px;
          overflow: hidden;
          height: calc(100vh - 160px);
          display: flex;
          flex-direction: column;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .notifications-controls {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #252525;
          border-bottom: 1px solid #333;
        }

        .filter-controls,
        .action-controls {
          display: flex;
          gap: 8px;
        }

        .filter-btn,
        .mark-all-read,
        .delete-all {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid #444;
          background: #2d2d2d;
          color: #e0e0e0;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .filter-btn:hover,
        .mark-all-read:hover,
        .delete-all:hover {
          background: #333;
        }

        .filter-btn.active {
          background: #3a3a3a;
          border-color: #666;
        }

        .mark-all-read,
        .delete-all {
          display: flex;
          align-items: center;
        }

        .mark-all-read:disabled,
        .delete-all:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .delete-all {
          background: #3d1212;
          border-color: #541919;
        }

        .delete-all:hover {
          background: #4d1616;
        }

        .notifications-container {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .notifications-list-container {
          width: 40%;
          border-right: 1px solid #333;
          display: flex;
          flex-direction: column;
        }

        .notifications-list-container h3 {
          padding: 16px 20px;
          margin: 0;
          border-bottom: 1px solid #333;
        }

        .notifications-list {
          overflow-y: auto;
          flex: 1;
        }

        .notification-item {
          display: flex;
          padding: 16px 20px;
          border-bottom: 1px solid #292929;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .notification-item:hover {
          background-color: #282828;
        }

        .notification-item.selected {
          background-color: #2d3748;
        }

        .notification-item.unread {
          background-color: #1e293b;
        }

        .notification-item.unread:hover {
          background-color: #233246;
        }

        .notification-item.unread.selected {
          background-color: #2c3e50;
        }

        .notification-indicator {
          width: 6px;
          min-width: 6px;
          border-radius: 3px;
          margin-right: 12px;
        }

        .notification-content {
          flex: 1;
        }

        .notification-message {
          font-size: 14px;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .notification-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #a0a0a0;
        }

        .notification-time {
          color: #888;
        }

        .notification-confidence {
          font-weight: 500;
          color: #f0f0f0;
        }

        .notification-detail-container {
          width: 60%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .notification-detail {
          padding: 20px;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .detail-header h3 {
          margin: 0;
        }

        .detail-actions {
          display: flex;
          gap: 8px;
        }

        .mark-read-btn,
        .delete-btn {
          padding: 6px 12px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mark-read-btn {
          background: #2d2d2d;
          color: #e0e0e0;
        }

        .mark-read-btn:hover {
          background: #333;
        }

        .delete-btn {
          background: #3d1212;
          color: #e0e0e0;
        }

        .delete-btn:hover {
          background: #4d1616;
        }

        .detail-timestamp {
          font-size: 14px;
          color: #888;
          margin-bottom: 20px;
        }

        .detection-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex: 1;
          overflow-y: auto;
        }

        .image-gallery {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }

        .image-card {
          background: #252525;
          border-radius: 8px;
          overflow: hidden;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .detection-image {
          max-width: 100%;
          max-height: 300px;
          object-fit: contain;
        }

        .image-label {
          padding: 10px;
          background: #333;
          width: 100%;
          text-align: center;
          font-size: 14px;
          color: #e0e0e0;
        }

        .streamer-info-card {
          background: #252525;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .streamer-info-card h4 {
          margin: 0 0 16px 0;
          font-size: 18px;
          color: #e0e0e0;
        }

        .info-item {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
        }

        .info-label {
          width: 120px;
          font-weight: 500;
          color: #a0a0a0;
        }

        .info-value {
          flex: 1;
          color: #e0e0e0;
        }

        .detected-objects {
          background: #252525;
          border-radius: 8px;
          padding: 16px;
        }

        .detected-objects h4 {
          margin: 0 0 16px 0;
          font-size: 18px;
          color: #e0e0e0;
        }

        .detection-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .detection-class {
          font-weight: 500;
          color: #e0e0e0;
        }

        .confidence-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-weight: 500;
          color: white;
        }

        .detail-actions-bottom {
          display: flex;
          gap: 8px;
          margin-top: 20px;
          justify-content: flex-end;
        }

        .action-btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid #444;
          background: #2d2d2d;
          color: #e0e0e0;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: #333;
        }

        .action-btn.primary {
          background: #1d4ed8;
          border-color: #2563eb;
        }

        .action-btn.primary:hover {
          background: #2563eb;
        }

        .empty-detail,
        .empty-state,
        .loading-container,
        .error-message {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #888;
          text-align: center;
          padding: 20px;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top: 4px solid #007bff;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .error-message {
          color: #ff6b6b;
        }

        @media (max-width: 992px) {
          .notifications-container {
            flex-direction: column;
          }

          .notifications-list-container,
          .notification-detail-container {
            width: 100%;
            height: 50%;
          }

          .notifications-list-container {
            border-right: none;
            border-bottom: 1px solid #333;
          }
        }

        @media (max-width: 768px) {
          .notifications-controls {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .filter-controls,
          .action-controls {
            justify-content: space-between;
          }

          .image-gallery {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default NotificationsPage;
