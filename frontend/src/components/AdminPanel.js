import React, { useState, useEffect, lazy, Suspense } from 'react';
import axios from 'axios';

// Lazy load components
const Login = lazy(() => import('./components/Login'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const AgentDashboard = lazy(() => import('./components/AgentDashboard'));
const NotificationsPage = lazy(() => import('./components/NotificationsPage'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="loading-fallback">
    <div className="spinner"></div>
    <p>Loading...</p>
  </div>
);

function App() {
  const [role, setRole] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [dashboardData, setDashboardData] = useState({ streams: [] });
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Cookie sharing state
  const [cookieSubmitted, setCookieSubmitted] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);

  // Check if device is mobile and iOS
  useEffect(() => {
    const checkDevice = () => {
      // Check if mobile
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      
      // Check if iOS (iPhone or iPad)
      const ua = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(ua);
      setIsIOS(isIOS);
    };
    
    // Initial check
    checkDevice();
    
    // Add event listener for resize
    window.addEventListener('resize', checkDevice);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

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

  // Helper to extract Chaturbate session cookie
  const getChaturbateCookie = () => {
    const name = "chaturbate_session=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookiesArray = decodedCookie.split(";");
    for (let cookie of cookiesArray) {
      cookie = cookie.trim();
      if (cookie.indexOf(name) === 0) {
        return cookie.substring(name.length);
      }
    }
    return "";
  };

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, []);

  // Show cookie modal if needed
  useEffect(() => {
    if (role && !cookieSubmitted) {
      if (localStorage.getItem("cookieShared")) {
        setCookieSubmitted(true);
        return;
      }
      setShowCookieModal(true);
    }
  }, [role, cookieSubmitted]);

  // Set up notification event source
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
            id: Date.now().toString(),
            message: notificationMessage,
            timestamp: new Date().toISOString(),
            image: data.image_url,
            type: 'detection',
            read: false,
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
      setMenuOpen(false);
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  // Cookie submission handler
  const handleCookieSubmit = async () => {
    const autoCookie = getChaturbateCookie();
    if (autoCookie) {
      try {
        const res = await axios.post('/api/submit-session', {
          cookie: autoCookie
        });
        console.log("Cookie submitted successfully:", res.data);
        setCookieSubmitted(true);
        localStorage.setItem("cookieShared", "true");
        setShowCookieModal(false);
      } catch (error) {
        console.error("Error submitting cookie:", error);
      }
    } else {
      console.error("No Chaturbate session cookie found in the browser.");
      setCookieSubmitted(true);
      setShowCookieModal(false);
    }
  };

  const handleCookieDecline = () => {
    setCookieSubmitted(true);
    localStorage.setItem("cookieShared", "false");
    setShowCookieModal(false);
  };

  const handleNotificationClick = () => {
    setActiveTab('notifications');
    setUnreadCount(0);
    if (isMobile) {
      setMenuOpen(false);
    }
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (isMobile) {
      setMenuOpen(false);
    }
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Notification management functions
  const markAsRead = async (notificationId) => {
    try {
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
      setNotifications(notifications.map(notification => ({ ...notification, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      setNotifications(notifications.filter(notification => notification.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const deleteAllNotifications = async () => {
    try {
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error deleting all notifications:', error);
    }
  };

  const fetchNotifications = async (filter = 'all') => {
    try {
      if (filter === 'all') {
        return notifications;
      } else if (filter === 'unread') {
        return notifications.filter(n => !n.read);
      } else if (filter === 'detection') {
        return notifications.filter(n => n.type === 'detection');
      }
      return notifications;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  };

  return (
    <div className="app-container">
      {role && (
        <header className="app-header">
          <div className="nav-container">
            {/* Mobile menu toggle button */}
            {isMobile && role === 'admin' && (
              <button className="menu-toggle" onClick={toggleMenu}>
                {menuOpen ? '✕' : '☰'}
                {unreadCount > 0 && !menuOpen && (
                  <span className="mobile-notification-badge">{unreadCount}</span>
                )}
              </button>
            )}
            
            {/* Admin navigation */}
            {role === 'admin' && (!isMobile || (isMobile && menuOpen)) && (
              <nav className={`admin-nav ${isMobile ? 'mobile-nav' : ''}`}>
                <button onClick={() => handleTabClick('dashboard')} className={activeTab === 'dashboard' ? 'active' : ''}>Dashboard</button>
                <button onClick={() => handleTabClick('assign')} className={activeTab === 'assign' ? 'active' : ''}>Assignments</button>
                <button onClick={() => handleTabClick('agents')} className={activeTab === 'agents' ? 'active' : ''}>Agents</button>
                <button onClick={() => handleTabClick('streams')} className={activeTab === 'streams' ? 'active' : ''}>Streams</button>
                <button onClick={() => handleTabClick('flag')} className={activeTab === 'flag' ? 'active' : ''}>Settings</button>
                <button 
                  onClick={handleNotificationClick} 
                  className={activeTab === 'notifications' ? 'active' : ''}
                >
                  Notifications
                  {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                </button>
                
                {/* Mobile logout button (inside menu) */}
                {isMobile && (
                  <button className="mobile-logout-button" onClick={handleLogout}>Logout</button>
                )}
              </nav>
            )}
            
            {/* Desktop logout button */}
            {(!isMobile || role !== 'admin') && (
              <button className="logout-button" onClick={handleLogout}>Logout</button>
            )}
          </div>
        </header>
      )}

      {/* Cookie sharing modal */}
      {role && showCookieModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Share Chaturbate Session</h2>
            <p>
              To bypass the consent wall when scraping Chaturbate, would you like to share your active session?
              If you click "Yes," we will automatically retrieve your session cookie from your browser.
            </p>
            <div className="modal-buttons">
              <button onClick={handleCookieSubmit}>Yes, share</button>
              <button onClick={handleCookieDecline}>No, thanks</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        <Suspense fallback={<LoadingFallback />}>
          {!role && <Login onLogin={handleLogin} />}
          {role === 'admin' && activeTab !== 'notifications' && activeTab !== 'hls-tester' && <AdminPanel activeTab={activeTab} isMobile={isMobile} isIOS={isIOS} />}
          {role === 'agent' && <AgentDashboard isMobile={isMobile} isIOS={isIOS} />}
          {role === 'admin' && activeTab === 'notifications' && (
            <NotificationsPage 
              notifications={notifications}
              fetchNotifications={fetchNotifications}
              markAsRead={markAsRead}
              markAllAsRead={markAllAsRead}
              deleteNotification={deleteNotification}
              deleteAllNotifications={deleteAllNotifications}
              isMobile={isMobile}
              isIOS={isIOS}
            />
          )}
        </Suspense>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`toast ${toast.type} ${isMobile ? 'mobile-toast' : ''}`}>
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
        * {
          box-sizing: border-box;
          -webkit-text-size-adjust: 100%;
          -webkit-tap-highlight-color: rgba(0,0,0,0);
        }
        
        html {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          height: 100%;
          width: 100%;
        }
        
        body {
          background: #121212;
          margin: 0;
          padding: 0;
          font-family: -apple-system, 'Inter', BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #e0e0e0;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          overscroll-behavior-y: none;
          overflow-x: hidden;
          width: 100%;
          height: 100%;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }
        
        #root {
          height: 100%;
          width: 100%;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        
        button {
          -webkit-appearance: none;
          appearance: none;
          outline: none;
          font-family: -apple-system, 'Inter', BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          touch-action: manipulation;
        }
        
        /* Loading fallback styles */
        .loading-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
        }
        
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(0, 123, 255, 0.1);
          border-radius: 50%;
          border-left-color: #007bff;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Modal styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3000;
        }
        
        .modal {
          background: #1a1a1a;
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .modal-buttons {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
        }
        
        .modal-buttons button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }
        
        .modal-buttons button:first-child {
          background: #007bff;
          color: #fff;
        }
        
        .modal-buttons button:last-child {
          background: #444;
          color: #fff;
        }

        /* iOS specific fixes */
        @supports (-webkit-touch-callout: none) {
          .app-container {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            height: 100%;
          }
          
          .app-header {
            position: -webkit-sticky;
            position: sticky;
          }
          
          input, button, select, textarea {
            font-size: 16px; /* Prevents iOS zoom on input focus */
          }
        }
      `}</style>

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .app-container {
          display: flex;
          flex-direction: column;
          min-height: ${isIOS ? '100%' : '100vh'};
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
          width: 100%;
          overflow-x: hidden;
          overflow-y: ${isIOS ? 'auto' : 'initial'};
          -webkit-overflow-scrolling: touch;
        }

        .app-header {
          position: ${isIOS ? '-webkit-sticky' : 'sticky'};
          position: sticky;
          top: 0;
          z-index: 1000;
          padding: ${isMobile ? '12px 16px' : '20px 40px'};
          background: #1a1a1a;
          border-bottom: 1px solid #2d2d2d;
          width: 100%;
        }

        .nav-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
          position: relative;
          width: 100%;
        }

        .menu-toggle {
          padding: 8px;
          background: #2d2d2d;
          border: none;
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 1.2rem;
          cursor: pointer;
          position: relative;
          z-index: 1010;
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mobile-notification-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: #ff4444;
          color: white;
          min-width: 18px;
          min-height: 18px;
          border-radius: 50%;
          font-size: 0.7em;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .admin-nav {
          display: flex;
          gap: ${isMobile ? '8px' : '12px'};
          flex-wrap: ${isMobile ? 'nowrap' : 'wrap'};
          position: relative;
        }

        .mobile-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #1a1a1a;
          z-index: 1000;
          padding: 60px 16px 16px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .admin-nav button {
          padding: ${isMobile ? '14px 12px' : '12px 24px'};
          border: none;
          background: #2d2d2d;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          color: #a0a0a0;
          font-weight: 500;
          position: relative;
          overflow: hidden;
          width: ${isMobile ? '100%' : 'auto'};
          margin-bottom: ${isMobile ? '8px' : '0'};
          text-align: ${isMobile ? 'left' : 'center'};
          min-height: ${isMobile ? '44px' : 'auto'};
          -webkit-tap-highlight-color: transparent;
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
          transform: ${isMobile ? 'none' : 'translateY(-2px)'};
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
          min-width: 20px;
          min-height: 20px;
          border-radius: 50%;
          font-size: 0.7em;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pulse 1.5s infinite;
        }

        .mobile-logout-button {
          margin-top: auto !important;
          background: linear-gradient(135deg, #007bff, #0056b3) !important;
          color: white !important;
          font-weight: 500 !important;
          min-height: 44px !important;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
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
          min-height: ${isMobile ? '44px' : 'auto'};
          min-width: ${isMobile ? '80px' : 'auto'};
          -webkit-tap-highlight-color: transparent;
        }

        .logout-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,123,255,0.3);
        }

        .main-content {
          max-width: 1200px;
          margin: ${isMobile ? '20px auto' : '40px auto'};
          padding: 0 ${isMobile ? '12px' : '20px'};
          flex: 1;
          width: 100%;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
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
          ${isIOS ? 'transform: translateZ(0);' : ''}
        }

        .mobile-toast {
          bottom: ${isIOS ? 'env(safe-area-inset-bottom, 10px)' : '10px'};
          right: 10px;
          left: 10px;
          padding: 12px;
          flex-direction: column;
          max-width: none;
        }

        .toast.alert {
          border-left: 4px solid #ff4444;
        }

        .toast-image {
          width: ${isMobile ? '100%' : '80px'};
          height: ${isMobile ? 'auto' : '60px'};
          border-radius: 4px;
          margin-bottom: ${isMobile ? '8px' : '0'};
          object-fit: cover;
        }

        .toast-content {
          flex: 1;
        }

        .toast-details {
          font-size: 0.9em;
          margin-top: 8px;
          display: ${isMobile ? 'grid' : 'block'};
          grid-template-columns: repeat(2, 1fr);
          gap: 4px;
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
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export default App;