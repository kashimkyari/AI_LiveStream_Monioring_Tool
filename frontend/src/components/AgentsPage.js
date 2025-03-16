import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AgentsPage = () => {
  const [agents, setAgents] = useState([]);
  const [newAgent, setNewAgent] = useState({ 
    username: '', 
    password: '',
    firstname: '',
    lastname: '',
    email: '',
    phonenumber: '',
    staffid: ''
  });
  const [agentMsg, setAgentMsg] = useState('');
  const [agentError, setAgentError] = useState('');
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/agents');
      setAgents(res.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching agents:', error);
      setError(error.message || 'Failed to fetch agents');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCreateAgent = async () => {
    setAgentError('');
    setAgentMsg('');
    const requiredFields = ['username', 'password', 'firstname', 'lastname', 'email', 'phonenumber'];
    const missingFields = requiredFields.filter(field => !newAgent[field].trim());
    
    if (missingFields.length > 0) {
      setAgentError(`Missing required fields: ${missingFields.join(', ')}`);
      return;
    }
    
    try {
      const res = await axios.post('/api/agents', newAgent);
      setAgentMsg(res.data.message);
      setNewAgent({ 
        username: '', 
        password: '',
        firstname: '',
        lastname: '',
        email: '',
        phonenumber: '',
        staffid: ''
      });
      fetchAgents();
      setShowAgentModal(false);
    } catch (error) {
      setAgentError(error.response?.data.message || 'Error creating agent.');
    }
  };

  const handleEditAgentName = async (agentId, currentName) => {
    const newUsername = prompt("Enter new username:", currentName);
    if (newUsername && newUsername.trim() !== currentName) {
      try {
        await axios.put(`/api/agents/${agentId}`, { username: newUsername });
        fetchAgents();
      } catch (error) {
        console.error('Error updating agent name:', error);
      }
    }
  };

  const handleEditAgentPassword = async (agentId) => {
    const newPassword = prompt("Enter new password:");
    if (newPassword && newPassword.trim()) {
      try {
        await axios.put(`/api/agents/${agentId}`, { password: newPassword });
        fetchAgents();
      } catch (error) {
        console.error('Error updating agent password:', error);
      }
    }
  };

  const handleDeleteAgent = async (agentId) => {
    if (!window.confirm('Are you sure you want to delete this agent?')) {
      return;
    }
    
    try {
      await axios.delete(`/api/agents/${agentId}`);
      fetchAgents();
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert(error.response?.data?.message || 'Failed to delete agent');
    }
  };

  if (loading) return (
    <div className="agents-container">
      <div className="loading-container">
        <div className="loading-text">Loading agents...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="agents-container">
      <div className="error-container">
        Error: {error}
      </div>
      <button 
        onClick={() => fetchAgents()}
        className="retry-button"
      >
        Try Again
      </button>
    </div>
  );

  return (
    <div className="agents-container">
      <h1 className="page-title">Agent Management</h1>
      
      {/* Add New Agent Form */}
      <div className="form-container">
        <h2 className="form-title">Add New Agent</h2>
        {agentError && <div className="error-message">{agentError}</div>}
        {agentMsg && <div className="success-message">{agentMsg}</div>}
        
        <button 
          onClick={() => setShowAgentModal(true)} 
          className="add-button"
        >
          Create/Add Agent
        </button>
      </div>
      
      {/* Agents Table */}
      <div className="tables-container">
        <div className="platform-section">
          <h2 className="section-title">All Agents</h2>
          <table className="streams-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>First Name</th>
                <th>Last Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Staff ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>{agent.id}</td>
                  <td>{agent.firstname}</td>
                  <td>{agent.lastname}</td>
                  <td>{agent.username}</td>
                  <td>{agent.email}</td>
                  <td>{agent.phonenumber}</td>
                  <td>{agent.staffid || '-'}</td>
                  <td>
                    <button 
                      onClick={() => handleEditAgentName(agent.id, agent.username)} 
                      className="edit-button"
                    >
                      Edit Name
                    </button>
                    <button 
                      onClick={() => handleEditAgentPassword(agent.id)} 
                      className="edit-button"
                    >
                      Edit Password
                    </button>
                    <button 
                      onClick={() => handleDeleteAgent(agent.id)} 
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Creation Modal */}
      {showAgentModal && (
        <div className="modal-overlay" onClick={() => setShowAgentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Create New Agent</h3>
            <button className="close-button" onClick={() => setShowAgentModal(false)}>×</button>
            
            <div className="agent-form">
              <div className="form-group">
                <input
                  type="text"
                  placeholder="First Name *"
                  value={newAgent.firstname}
                  onChange={(e) => setNewAgent({ ...newAgent, firstname: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Last Name *"
                  value={newAgent.lastname}
                  onChange={(e) => setNewAgent({ ...newAgent, lastname: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Username *"
                  value={newAgent.username}
                  onChange={(e) => setNewAgent({ ...newAgent, username: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <input
                  type="email"
                  placeholder="Email *"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <input
                  type="tel"
                  placeholder="Phone Number *"
                  value={newAgent.phonenumber}
                  onChange={(e) => setNewAgent({ ...newAgent, phonenumber: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <input
                  type="password"
                  placeholder="Password *"
                  value={newAgent.password}
                  onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Staff ID (Optional)"
                  value={newAgent.staffid}
                  onChange={(e) => setNewAgent({ ...newAgent, staffid: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <button onClick={handleCreateAgent} className="submit-button">
                Create Agent
              </button>
            </div>
            
            {agentError && <div className="error-message">{agentError}</div>}
            {agentMsg && <div className="success-message">{agentMsg}</div>}
          </div>
        </div>
      )}

      <style jsx>{`
        .agents-container {
          padding: 20px;
          max-width: 900px;
          margin: 0 auto;
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: bold;
          margin-bottom: 1.5rem;
          color: #e0e0e0;
        }

        .form-container {
          margin: 1.5rem 0;
          padding: 1rem;
          background: #1a1a1a;
          border-radius: 8px;
          border: 1px solid #2d2d2d;
        }

        .form-title {
          font-size: 1.25rem;
          font-weight: bold;
          margin-bottom: 1rem;
          color: #e0e0e0;
        }

        .error-message {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: rgba(255, 68, 68, 0.1);
          color: #ff4444;
          border-radius: 4px;
          border-left: 3px solid #ff4444;
        }

        .success-message {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: rgba(40, 167, 69, 0.1);
          color: #28a745;
          border-radius: 4px;
          border-left: 3px solid #28a745;
        }

        .add-button {
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .add-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        }

        .platform-section {
          margin-top: 1.5rem;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #e0e0e0;
        }

        .streams-table {
          width: 100%;
          border-collapse: collapse;
          background: #1a1a1a;
          border-radius: 8px;
          overflow: hidden;
        }

        .streams-table th {
          padding: 0.75rem 1rem;
          text-align: left;
          background: #252525;
          color: #e0e0e0;
          font-weight: 500;
          border-bottom: 1px solid #333;
        }

        .streams-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #2d2d2d;
          color: #e0e0e0;
        }

        .streams-table tr:hover {
          background: #252525;
        }

        .edit-button {
          padding: 0.4rem 0.75rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-right: 5px;
        }

        .edit-button:hover {
          background: #0056b3;
        }

        .delete-button {
          padding: 0.4rem 0.75rem;
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .delete-button:hover {
          background: #cc3333;
        }

        .loading-container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 8rem;
        }

        .loading-text {
          font-size: 1.1rem;
          color: #a0a0a0;
        }

        .error-container {
          padding: 1rem;
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid #ff4444;
          border-radius: 4px;
          color: #ff4444;
        }

        .retry-button {
          margin-top: 1rem;
          padding: 0.75rem 1.25rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .retry-button:hover {
          background: #0056b3;
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
          background: #1a1a1a;
          padding: 2rem;
          border-radius: 8px;
          max-width: 600px;
          width: 90%;
          position: relative;
          animation: zoomIn 0.3s ease;
          border: 1px solid #2d2d2d;
        }

        .modal-title {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          color: #e0e0e0;
        }

        .close-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: #e0e0e0;
          font-size: 1.5rem;
          cursor: pointer;
          transition: color 0.3s ease;
        }

        .close-button:hover {
          color: #ff4444;
        }

        .agent-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-group {
          width: 100%;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem;
          background: #252525;
          border: 1px solid #333;
          border-radius: 4px;
          color: #e0e0e0;
          transition: all 0.3s ease;
        }

        .form-input:focus {
          border-color: #007bff;
          outline: none;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
        }

        .submit-button {
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
          margin-top: 1rem;
        }

        .submit-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        }

        @keyframes zoomIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @media (max-width: 768px) {
          .streams-table {
            display: block;
            overflow-x: auto;
          }

          .form-container, .platform-section {
            padding: 0.75rem;
          }

          .modal-content {
            padding: 1.5rem;
            width: 95%;
          }
        }
      `}</style>
    </div>
  );
};

export default AgentsPage;