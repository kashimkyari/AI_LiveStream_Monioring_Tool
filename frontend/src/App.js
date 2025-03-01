import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import AgentDashboard from './components/AgentDashboard';

function App() {
  const [role, setRole] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const checkSession = async () => {
    try {
      const res = await axios.get('/api/session');
      if (res.data.logged_in) {
        setRole(res.data.user.role);
      }
    } catch (error) {
      console.log("No active session.");
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLogin = (role) => {
    setRole(role);
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout');
      setRole(null);
    } catch (err) {
      console.error("Logout error", err);
    }
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
                             </nav>
            )}
            <button className="logout-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>
      )}
      
      <div className="main-content">
        {!role && <Login onLogin={handleLogin} />}
        {role === 'admin' && <AdminPanel activeTab={activeTab} />}
        {role === 'agent' && <AgentDashboard />}
      </div>

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
      `}</style>
    </div>
  );
}

export default App;