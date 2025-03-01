import React, { useState } from 'react';
import axios from 'axios';

axios.defaults.withCredentials = true;

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/login', { username, password });
      onLogin(res.data.role);
    } catch (err) {
      console.error('Login error:', err);
      setError('Invalid username or password');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2 className="welcome-text">Account Login</h2>
        {error && <div className="error-message animate-shake">{error}</div>}
        
        <div className="form-content">
          <div className="input-group">
            <div className="input-container">
              <input
                type="text"
                id="username"
                placeholder=" "
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
                className="input-field"
                autoComplete="username"
              />
              <label htmlFor="username" className="input-label">Username</label>
            </div>
          </div>

          <div className="input-group">
            <div className="input-container">
              <input
                type="password"
                id="password"
                placeholder=" "
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                className="input-field"
                autoComplete="current-password"
              />
              <label htmlFor="password" className="input-label">Password</label>
            </div>
          </div>

          <div className="button-container">
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? <div className="spinner"></div> : 'Sign In'}
            </button>
          </div>
        </div>
      </form>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        .login-container {
          max-width: 440px;
          margin: 100px auto;
          padding: 48px 40px;
          border-radius: 16px;
          background: #1a1a1a;
          border: 1px solid #2d2d2d;
          box-shadow: 0 8px 32px rgba(0,0,0,0.24);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .form-content {
          width: 100%;
          max-width: 320px;
        }

        .welcome-text {
          text-align: center;
          margin: 0 0 2.5rem 0;
          font-size: 2rem;
          font-weight: 600;
          letter-spacing: -0.5px;
          color: #f0f0f0;
          line-height: 1.3;
        }

        .input-group {
          position: relative;
          margin-bottom: 1.5rem;
          width: 100%;
        }

        .input-container {
          position: relative;
          width: 100%;
        }

        .input-field {
          width: 100%;
          padding: 16px 20px;
          background: #252525;
          border: 1px solid #383838;
          border-radius: 8px;
          color: #f8f8f8;
          font-size: 1rem;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          line-height: 1.5;
        }

        .input-field:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0,123,255,0.15);
          background: #2a2a2a;
        }

        .input-label {
          position: absolute;
          left: 20px;
          top: 50%;
          transform: translateY(-50%);
          color: #909090;
          pointer-events: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-size: 1rem;
          padding: 0 4px;
          font-weight: 400;
        }

        .input-field:focus + .input-label,
        .input-field:not(:placeholder-shown) + .input-label {
          transform: translateY(-40px) scale(0.9);
          color: #007bff;
          left: 16px;
          background: #1a1a1a;
          padding: 0 8px;
        }

        .button-container {
          display: flex;
          justify-content: center;
          width: 100%;
          margin-top: 1.5rem;
        }

        .login-button {
          padding: 16px 40px;
          background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          letter-spacing: 0.5px;
          text-align: center;
          min-width: 140px;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 20px rgba(0,123,255,0.25);
        }

        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error-message {
          color: #ff6b6b;
          background: rgba(255,107,107,0.1);
          padding: 14px;
          border-radius: 8px;
          border: 1px solid rgba(255,107,107,0.2);
          margin-bottom: 1.5rem;
          font-weight: 500;
          font-size: 0.95rem;
          text-align: center;
          width: 100%;
          max-width: 320px;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          margin: 0 auto;
          animation: spin 1s linear infinite;
        }

        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }

        @media (max-width: 480px) {
          .login-container {
            margin: 60px 20px;
            padding: 40px 24px;
          }
          
          .welcome-text {
            font-size: 1.75rem;
            margin-bottom: 2rem;
          }
          
          .input-field {
            padding: 14px 18px;
          }
          
          .form-content {
            max-width: 100%;
          }
          
          .login-button {
            padding: 14px 32px;
            min-width: 120px;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;