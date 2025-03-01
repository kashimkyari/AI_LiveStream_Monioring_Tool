import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Notifications = ({ showNotifications }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/api/notifications');
        setNotifications(res.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching notifications:', error);
        setError('Failed to load notifications. Please try again.');
        setLoading(false);
      }
    };

    if (showNotifications) {
      fetchNotifications();
      
      // Set up polling for new notifications
      const interval = setInterval(fetchNotifications, 30000);
      
      // Clean up on unmount or when showNotifications changes
      return () => clearInterval(interval);
    }
  }, [showNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}`, { read: true });
      setNotifications(notifications.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: true }
          : notification
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      setNotifications(notifications.map(notification => ({ ...notification, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await axios.delete(`/api/notifications/${notificationId}`);
      setNotifications(notifications.filter(notification => notification.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  if (!showNotifications) return null;

  return (
    <div className="notifications-panel">
      <div className="notifications-header">
        <h3>Notifications</h3>
        {notifications.length > 0 && (
          <button className="mark-all-read" onClick={markAllAsRead}>
            Mark All as Read
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading notifications...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : notifications.length === 0 ? (
        <div className="no-notifications">No new notifications</div>
      ) : (
        <div className="notifications-list">
          {notifications.map((notification) => (
            <div 
              key={notification.id} 
              className={`notification-item ${notification.read ? 'read' : 'unread'}`}
            >
              <div className="notification-content">
                <div className="notification-type" data-type={notification.type}>
                  {notification.type === 'alert' && '⚠️'}
                  {notification.type === 'info' && 'ℹ️'}
                  {notification.type === 'success' && '✅'}
                  {notification.type === 'warning' && '⚠️'}
                  {notification.type === 'error' && '❌'}
                </div>
                <div className="notification-details">
                  <div className="notification-message">{notification.message}</div>
                  <div className="notification-info">
                    {notification.streamId && (
                      <span className="stream-info">Stream ID: {notification.streamId}</span>
                    )}
                    <span className="notification-time">
                      {new Date(notification.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="notification-actions">
                {!notification.read && (
                  <button 
                    className="mark-read-btn" 
                    onClick={() => markAsRead(notification.id)}
                  >
                    Mark Read
                  </button>
                )}
                <button 
                  className="delete-btn" 
                  onClick={() => deleteNotification(notification.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .notifications-panel {
          position: absolute;
          top: 70px;
          right: 20px;
          width: 380px;
          max-height: 80vh;
          background: #252525;
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          z-index: 100;
          overflow: hidden;
          border: 1px solid #3d3d3d;
          animation: slideIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .notifications-header {
          padding: 15px 20px;
          background: #1e1e1e;
          border-bottom: 1px solid #3d3d3d;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .notifications-header h3 {
          margin: 0;
          color: #ffffff;
        }

        .mark-all-read {
          padding: 6px 12px;
          background: #2d2d2d;
          color: #e0e0e0;
          border: 1px solid #3d3d3d;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mark-all-read:hover {
          background: #333;
          color: #fff;
        }

        .notifications-list {
          overflow-y: auto;
          max-height: calc(80vh - 60px);
        }

        .notification-item {
          padding: 15px 20px;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background-color 0.2s ease;
        }

        .notification-item:hover {
          background-color: #2a2a2a;
        }

        .notification-item.unread {
          background-color: #1e293b;
        }

        .notification-item.unread:hover {
          background-color: #223247;
        }

        .notification-content {
          display: flex;
          align-items: flex-start;
          flex: 1;
        }

        .notification-type {
          margin-right: 15px;
          font-size: 20px;
        }

        .notification-details {
          flex: 1;
        }

        .notification-message {
          margin-bottom: 5px;
          color: #e0e0e0;
        }

        .notification-info {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #a0a0a0;
        }

        .notification-actions {
          display: flex;
          gap: 8px;
        }

        .mark-read-btn, .delete-btn {
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          border: none;
          transition: all 0.2s ease;
        }

        .mark-read-btn {
          background: #2d2d2d;
          color: #e0e0e0;
        }

        .mark-read-btn:hover {
          background: #333;
          color: #fff;
        }

        .delete-btn {
          background: #4a1212;
          color: #e0e0e0;
        }

        .delete-btn:hover {
          background: #5e1717;
          color: #fff;
        }

        .loading, .error, .no-notifications {
          padding: 20px;
          text-align: center;
          color: #a0a0a0;
        }

        .error {
          color: #ff6b6b;
        }

        [data-type="alert"], [data-type="warning"] {
          color: #ffc107;
        }

        [data-type="info"] {
          color: #0d6efd;
        }

        [data-type="success"] {
          color: #28a745;
        }

        [data-type="error"] {
          color: #dc3545;
        }

        @media (max-width: 768px) {
          .notifications-panel {
            width: calc(100% - 40px);
            right: 10px;
            left: 10px;
          }
        }
      `}</style>
    </div>
  );
};

export default Notifications;