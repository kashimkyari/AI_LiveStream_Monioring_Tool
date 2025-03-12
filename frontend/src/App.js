import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import AgentDashboard from './components/AgentDashboard';


function App() {
  const [role, setRole] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [dashboardData, setDashboardData] = useState({ streams: [] });

  const checkSession = async () => {
    try {
      const res = await axios.get('/api/session');
      if (res.data.logged_in) {
        setRole(res.data.user.role);
        if (res.data.user.role === 'admin') {
          const dashboardRes = await axios.get('/api/dashboard');
          setDashboardData(dashboardRes.data);
        }
      }
    } catch (error) {
      console.log("No active session.");
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (!role) return;

    const eventSource = new EventSource('/api/notification-events');

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'detection') {
        const stream = dashboardData.streams.find(s => s.room_url === data.stream);
        const agentName = stream?.agent?.username || 'Unassigned';
        const notificationMessage = `🚨 Detected ${data.object} (${(data.confidence * 100).toFixed(1)}%) in ${stream?.streamer_username || 'Unknown'}`;
        
        setUnreadCount(prev => prev + 1);
        setToast({
          message: notificationMessage,
          type: 'alert',
          image: data.image_url,
          details: {
            stream: stream?.id || 'N/A',
            agent: agentName,
            model: stream?.streamer_username || 'Unknown',
            confidence: `${(data.confidence * 100).toFixed(1)}%`
          }
        });

        setNotifications(prev => [
          { 
            id: data.id, 
            message: notificationMessage,
            timestamp: new Date().toLocaleString(),
            image: data.image_url,
            details: {
              stream: stream?.id || 'N/A',
              agent: agentName,
              model: stream?.streamer_username || 'Unknown',
              confidence: `${(data.confidence * 100).toFixed(1)}%`
            }
          }, 
          ...prev
        ]);
        
        setTimeout(() => setToast(null), 5000);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Notification error:', err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [role, dashboardData.streams]);

  const handleLogin = (role) => {
    setRole(role);
    if (role === 'admin') {
      axios.get('/api/dashboard').then(res => setDashboardData(res.data));
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
      setRole(null);
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  const handleNotificationClick = () => {
    setActiveTab('notifications');
    setUnreadCount(0);
  };

  return (
    <div className="app-container">
      {role && (
        <header className="app-header">
          <div className="nav-container">
            {role === 'admin' && (
              <nav className="admin-nav">
                <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'active' : ''}>Dashboard</button>
                <button onClick={() => setActiveTab('assign')} className={activeTab === 'assign' ? 'active' : ''}>Assignments</button>
                <button onClick={() => setActiveTab('agents')} className={activeTab === 'agents' ? 'active' : ''}>Agents</button>
                <button onClick={() => setActiveTab('streams')} className={activeTab === 'streams' ? 'active' : ''}>Streams</button>
                <button onClick={() => setActiveTab('flag')} className={activeTab === 'flag' ? 'active' : ''}>Settings</button>
                <button 
                  onClick={handleNotificationClick} 
                  className={activeTab === 'notifications' ? 'active' : ''}
                >
                  Notifications
                  {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                </button>
              </nav>
            )}
            <button className="logout-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>
      )}
      
      <div className="main-content">
        {!role && <Login onLogin={handleLogin} />}
        {role === 'admin' && activeTab !== 'notifications' && <AdminPanel activeTab={activeTab} />}
        {role === 'agent' && <AgentDashboard />}
        {role === 'admin' && activeTab === 'notifications' && (
          <div className="notifications-tab">
            <h2>Notifications</h2>
            {notifications.length === 0 ? (
              <p>No notifications yet.</p>
            ) : (
              <div className="notifications-list">
                {notifications.map(note => (
                  <div key={note.id} className="notification-item">
                    <div className="notification-header">
                      <div className="notification-message">{note.message}</div>
                      <div className="notification-timestamp">{note.timestamp}</div>
                    </div>
                    {note.image && (
                      <img 
                        src={note.image} 
                        alt="Detection" 
                        className="notification-image"
                      />
                    )}
                    <div className="notification-details">
                      {Object.entries(note.details).map(([key, value]) => (
                        <div key={key} className="detail-item">
                          <strong>{key}:</strong> {value}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.image && (
            <img 
              src={toast.image} 
              alt="Detection" 
              className="toast-image"
            />
          )}
          <div className="toast-content">
            <div className="toast-message">{toast.message}</div>
            <div className="toast-details">
              {Object.entries(toast.details).map(([key, value]) => (
                <div key={key} className="detail-item">
                  <strong>{key}:</strong> {value}
                </div>
              ))}
            </div>
          </div>
          <div className="toast-progress" />
        </div>
      )}

      <style jsx global>{`
        body {
          background: #121212;
          margin: 0;
          font-family: 'Inter', sans-serif;
          color: #e0e0e0;
        }
      `}</style>

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .app-container {
          min-height: 100vh;
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .app-header {
          position: sticky;
          top: 0;
          z-index: 1000;
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

        .admin-nav {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          position: relative;
        }

        .admin-nav button {
          padding: 12px 24px;
          border: none;
          background: #2d2d2d;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          color: #a0a0a0;
          font-weight: 500;
          position: relative;
          overflow: hidden;
        }

        .admin-nav button::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: #007bff;
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .admin-nav button.active, 
        .admin-nav button:hover {
          background: #333;
          color: #fff;
          transform: translateY(-2px);
        }

        .admin-nav button.active::before {
          transform: scaleX(1);
        }

        .notification-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: #ff4444;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          font-size: 0.7em;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pulse 1.5s infinite;
        }

        .logout-button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .logout-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,123,255,0.3);
        }

        .main-content {
          max-width: 900px;
          margin: 40px auto;
          padding: 0 20px;
        }

        .notifications-tab {
          padding: 20px;
          background: #1a1a1a;
          border-radius: 8px;
          margin-top: 20px;
        }

        .notifications-list {
          max-height: 60vh;
          overflow-y: auto;
        }

        .notification-item {
          padding: 12px;
          margin-bottom: 8px;
          background: #252525;
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }

        .notification-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .notification-timestamp {
          font-size: 0.8em;
          color: #888;
        }

        .notification-image {
          width: 100%;
          max-width: 200px;
          margin-top: 8px;
          border-radius: 4px;
        }

        .notification-details {
          margin-top: 8px;
          font-size: 0.9em;
        }

        .detail-item {
          margin: 4px 0;
        }

        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #2d2d2d;
          color: white;
          padding: 16px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: slideIn 0.3s ease-out;
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 2000;
          max-width: 400px;
        }

        .toast.alert {
          border-left: 4px solid #ff4444;
        }

        .toast-image {
          width: 80px;
          height: 60px;
          border-radius: 4px;
        }

        .toast-content {
          flex: 1;
        }

        .toast-details {
          font-size: 0.9em;
          margin-top: 8px;
        }

        .toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: #ffffff44;
          animation: progress 5s linear;
        }

        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        @keyframes progress {
          from { width: 100%; }
          to { width: 0%; }
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        @media (max-width: 768px) {
          .app-header {
            padding: 15px;
          }
          
          .admin-nav {
            gap: 8px;
          }
          
          .admin-nav button {
            padding: 8px 16px;
            font-size: 0.9em;
          }
          
          .logout-button {
            padding: 8px 16px;
          }

          .toast {
            max-width: 300px;
            padding: 12px;
            flex-direction: column;
          }

          .toast-image {
            width: 100%;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}
export default App;