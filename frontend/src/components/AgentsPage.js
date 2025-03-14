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

  const fetchAgents = async () => {
    try {
      const res = await axios.get('/api/agents');
      setAgents(res.data);
    } catch (error) {
      console.error('Error fetching agents:', error);
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
    try {
      await axios.delete(`/api/agents/${agentId}`);
      fetchAgents();
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  return (
    <div className="agents-page">
      <h3>Manage Agents</h3>
      <button 
        className="create-agent-btn"
        onClick={() => setShowAgentModal(true)}
      >
        Create/Add Agent
      </button>
      <table>
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
                <button onClick={() => handleEditAgentName(agent.id, agent.username)}>Edit Name</button>
                <button onClick={() => handleEditAgentPassword(agent.id)}>Edit Password</button>
                <button onClick={() => handleDeleteAgent(agent.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAgentModal && (
        <div className="modal-overlay" onClick={() => setShowAgentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowAgentModal(false)}>×</button>
            <h3>Create New Agent</h3>
            <div className="form-container">
              <input
                type="text"
                placeholder="First Name *"
                value={newAgent.firstname}
                onChange={(e) => setNewAgent({ ...newAgent, firstname: e.target.value })}
              />
              <input
                type="text"
                placeholder="Last Name *"
                value={newAgent.lastname}
                onChange={(e) => setNewAgent({ ...newAgent, lastname: e.target.value })}
              />
              <input
                type="text"
                placeholder="Username *"
                value={newAgent.username}
                onChange={(e) => setNewAgent({ ...newAgent, username: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email *"
                value={newAgent.email}
                onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
              />
              <input
                type="tel"
                placeholder="Phone Number *"
                value={newAgent.phonenumber}
                onChange={(e) => setNewAgent({ ...newAgent, phonenumber: e.target.value })}
              />
              <input
                type="password"
                placeholder="Password *"
                value={newAgent.password}
                onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })}
              />
              <input
                type="text"
                placeholder="Staff ID (Optional)"
                value={newAgent.staffid}
                onChange={(e) => setNewAgent({ ...newAgent, staffid: e.target.value })}
              />
              <button onClick={handleCreateAgent}>Create Agent</button>
            </div>
            {agentError && <div className="error">{agentError}</div>}
            {agentMsg && <div className="message">{agentMsg}</div>}
          </div>
        </div>
      )}

      <style jsx>{`
        .agents-page {
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

        h3 {
          margin-bottom: 20px;
          font-size: 1.75rem;
          text-align: center;
        }

        .create-agent-btn {
          display: block;
          margin: 0 auto 20px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #28a745, #1e7e34);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .create-agent-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(40,167,69,0.3);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          background: #2d2d2d;
          border-radius: 10px;
          overflow: hidden;
        }

        table th, table td {
          padding: 14px;
          border: 1px solid #3d3d3d;
          color: #e0e0e0;
          text-align: left;
        }

        table th {
          background: rgba(0,123,255,0.1);
          font-weight: 600;
        }

        table td {
          vertical-align: middle;
        }

        table button {
          margin-right: 5px;
          padding: 6px 12px;
          background: #007bff;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.3s ease;
        }

        table button:hover {
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
          transition: transform 0.3s ease;
        }

        .close-button:hover {
          transform: rotate(90deg) scale(1.1);
        }

        .form-container {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin-bottom: 20px;
        }

        .form-container input {
          flex: 1;
          min-width: 200px;
          padding: 12px 18px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          color: #e0e0e0;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .form-container input:focus {
          border-color: #007bff;
          box-shadow: 0 0 10px rgba(0,123,255,0.3);
          outline: none;
        }

        .modal-content button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          font-weight: 500;
        }

        .modal-content button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,123,255,0.3);
        }

        .error {
          color: #ff4444;
          background: rgba(255, 68, 68, 0.1);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 68, 68, 0.2);
          margin: 15px 0;
          animation: shake 0.4s ease;
        }

        .message {
          color: #28a745;
          background: rgba(40, 167, 69, 0.1);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(40, 167, 69, 0.2);
          margin: 15px 0;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        @media (max-width: 768px) {
          .agents-page {
            margin: 20px;
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default AgentsPage;
