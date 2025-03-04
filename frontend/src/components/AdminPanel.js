import React, { useState, useEffect } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';
import ScraperPage from './ScraperPage';
import VisualTestPage from './VisualTestPage';

const AdminPanel = ({ activeTab }) => {
  const [dashboardData, setDashboardData] = useState({ ongoing_streams: 0, streams: [] });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [agentList, setAgentList] = useState([]);
  const [streamList, setStreamList] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedStreamId, setSelectedStreamId] = useState('');
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
  const [streams, setStreams] = useState([]);
  const [newStream, setNewStream] = useState({ room_url: '', platform: 'Chaturbate' });
  const [streamMsg, setStreamMsg] = useState('');
  const [streamError, setStreamError] = useState('');
  const [chatKeywords, setChatKeywords] = useState([]);
  const [newChatKeyword, setNewChatKeyword] = useState('');
  const [keywordMsg, setKeywordMsg] = useState('');
  const [keywordError, setKeywordError] = useState('');
  const [flaggedObjects, setFlaggedObjects] = useState([]);
  const [newFlaggedObject, setNewFlaggedObject] = useState('');
  const [objectMsg, setObjectMsg] = useState('');
  const [objectError, setObjectError] = useState('');
  const [detectionAlerts, setDetectionAlerts] = useState({});
  const [lastNotification, setLastNotification] = useState(0);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [telegramRecipients, setTelegramRecipients] = useState([]);
  const [newTelegramUsername, setNewTelegramUsername] = useState('');
  const [newTelegramChatId, setNewTelegramChatId] = useState('');

  const fetchDashboard = async () => {
    try {
      const res = await axios.get('/api/dashboard');
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await axios.get('/api/agents');
      setAgents(res.data);
      setAgentList(res.data);
      if (res.data.length > 0 && !selectedAgentId) {
        setSelectedAgentId(res.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchStreams = async () => {
    try {
      const res = await axios.get('/api/streams');
      setStreams(res.data);
      setStreamList(res.data);
      if (res.data.length > 0 && !selectedStreamId) {
        setSelectedStreamId(res.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching streams:', error);
    }
  };

  const fetchKeywords = async () => {
    try {
      const res = await axios.get('/api/keywords');
      setChatKeywords(res.data);
    } catch (error) {
      console.error('Error fetching keywords:', error);
    }
  };

  const fetchObjects = async () => {
    try {
      const res = await axios.get('/api/objects');
      setFlaggedObjects(res.data);
    } catch (error) {
      console.error('Error fetching objects:', error);
    }
  };

  const fetchTelegramRecipients = async () => {
    try {
      const res = await axios.get('/api/telegram_recipients');
      setTelegramRecipients(res.data);
    } catch (error) {
      console.error('Error fetching Telegram recipients:', error);
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

  const handleAssign = async () => {
    if (!selectedAgentId || !selectedStreamId) {
      alert('Both Agent and Stream must be selected.');
      return;
    }
    try {
      const res = await axios.post('/api/assign', {
        agent_id: selectedAgentId,
        stream_id: selectedStreamId,
      });
      alert(res.data.message);
      fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.message || 'Assignment failed.');
    }
  };

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

  const handleCreateStream = async () => {
    setStreamError('');
    setStreamMsg('');
    if (!newStream.room_url.trim()) {
      setStreamError('Room URL is required.');
      return;
    }
    try {
      const res = await axios.post('/api/streams', newStream);
      setStreamMsg(res.data.message);
      setNewStream({ room_url: '', platform: 'Chaturbate' });
      fetchStreams();
    } catch (error) {
      setStreamError(error.response?.data.message || 'Error creating stream.');
    }
  };

  const handleDeleteStream = async (streamId) => {
    try {
      await axios.delete(`/api/streams/${streamId}`);
      fetchStreams();
    } catch (error) {
      console.error('Error deleting stream:', error);
    }
  };

  const handleCreateKeyword = async () => {
    setKeywordError('');
    setKeywordMsg('');
    if (!newChatKeyword.trim()) {
      setKeywordError('Keyword is required.');
      return;
    }
    try {
      const res = await axios.post('/api/keywords', { keyword: newChatKeyword });
      setKeywordMsg(res.data.message);
      setNewChatKeyword('');
      fetchKeywords();
    } catch (error) {
      setKeywordError(error.response?.data.message || 'Error adding keyword.');
    }
  };

  const handleUpdateKeyword = async (keywordId, currentKeyword) => {
    const newKeyword = prompt("Enter new keyword:", currentKeyword);
    if (newKeyword && newKeyword.trim() !== currentKeyword) {
      try {
        await axios.put(`/api/keywords/${keywordId}`, { keyword: newKeyword });
        fetchKeywords();
      } catch (error) {
        console.error('Error updating keyword:', error);
      }
    }
  };

  const handleDeleteKeyword = async (keywordId) => {
    try {
      await axios.delete(`/api/keywords/${keywordId}`);
      fetchKeywords();
    } catch (error) {
      console.error('Error deleting keyword:', error);
    }
  };

  const handleCreateObject = async () => {
    setObjectError('');
    setObjectMsg('');
    if (!newFlaggedObject.trim()) {
      setObjectError('Object name is required.');
      return;
    }
    try {
      const res = await axios.post('/api/objects', { object_name: newFlaggedObject });
      setObjectMsg(res.data.message);
      setNewFlaggedObject('');
      fetchObjects();
    } catch (error) {
      setObjectError(error.response?.data.message || 'Error adding object.');
    }
  };

  const handleUpdateObject = async (objectId, currentName) => {
    const newName = prompt("Enter new object name:", currentName);
    if (newName && newName.trim() !== currentName) {
      try {
        await axios.put(`/api/objects/${objectId}`, { object_name: newName });
        fetchObjects();
      } catch (error) {
        console.error('Error updating object:', error);
      }
    }
  };

  const handleDeleteObject = async (objectId) => {
    try {
      await axios.delete(`/api/objects/${objectId}`);
      fetchObjects();
    } catch (error) {
      console.error('Error deleting object:', error);
    }
  };

  const handleCreateTelegramRecipient = async () => {
    try {
      await axios.post('/api/telegram_recipients', {
        telegram_username: newTelegramUsername,
        chat_id: newTelegramChatId
      });
      fetchTelegramRecipients();
      setNewTelegramUsername('');
      setNewTelegramChatId('');
    } catch (error) {
      console.error('Error adding recipient:', error);
    }
  };

  const handleDeleteTelegramRecipient = async (recipientId) => {
    try {
      await axios.delete(`/api/telegram_recipients/${recipientId}`);
      fetchTelegramRecipients();
    } catch (error) {
      console.error('Error deleting recipient:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboard();
      const interval = setInterval(fetchDashboard, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'agents') fetchAgents();
    if (activeTab === 'streams') fetchStreams();
    if (activeTab === 'assign') {
      fetchAgents();
      fetchStreams();
    }
    if (activeTab === 'flag') {
      fetchKeywords();
      fetchObjects();
      fetchTelegramRecipients();
    }
  }, [activeTab]);

  const closeModal = () => setSelectedAssignment(null);

  return (
    <div className="admin-panel">
      {activeTab === 'dashboard' && (
        <div className="tab-content">
          <h3>Dashboard</h3>
          <div className="dashboard-info">
            <p><strong>Ongoing Streams:</strong> {dashboardData.ongoing_streams}</p>
            <div className="assignment-grid">
              {dashboardData.streams.map((stream) => (
                <div key={stream.id} className="assignment-card" onClick={() => setSelectedAssignment(stream)}>
                  <VideoPlayer
                    room_url={stream.room_url}
                    streamer_username={stream.streamer_username}
                    thumbnail={true}
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
      )}

      {activeTab === 'assign' && (
        <div className="tab-content">
          <h3>Assign Stream</h3>
          <div className="form-container">
            <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)}>
              {agentList.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.username}</option>
              ))}
            </select>
            <select value={selectedStreamId} onChange={(e) => setSelectedStreamId(e.target.value)}>
              {streamList.map((stream) => (
                <option key={stream.id} value={stream.id}>
                  ID: {stream.id} - {stream.room_url} ({stream.platform})
                </option>
              ))}
            </select>
            <button onClick={handleAssign}>Assign</button>
          </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="tab-content">
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
        </div>
      )}

      {activeTab === 'streams' && (
        <div className="tab-content">
          <h3>Manage Streams</h3>
          <div className="form-container">
            <input
              type="text"
              placeholder="Room URL (e.g., https://chaturbate.com/cutefacebigass/)"
              value={newStream.room_url}
              onChange={(e) => setNewStream({ ...newStream, room_url: e.target.value })}
            />
            <select
              value={newStream.platform}
              onChange={(e) => setNewStream({ ...newStream, platform: e.target.value })}
            >
              <option value="Chaturbate">Chaturbate</option>
              <option value="Stripchat">Stripchat</option>
            </select>
            <button onClick={handleCreateStream}>Create Stream</button>
          </div>
          {streamError && <div className="error">{streamError}</div>}
          {streamMsg && <div className="message">{streamMsg}</div>}
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Room URL</th>
                <th>Platform</th>
                <th>Streamer</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => (
                <tr key={stream.id}>
                  <td>{stream.id}</td>
                  <td>{stream.room_url}</td>
                  <td>{stream.platform}</td>
                  <td>{stream.streamer_username}</td>
                  <td>
                    <button onClick={() => handleDeleteStream(stream.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'flag' && (
        <div className="tab-content">
          <h3>Flag Settings</h3>
          <div className="flag-section">
            <h4>Chat Keywords</h4>
            <div className="form-container">
              <input
                type="text"
                placeholder="New Keyword"
                value={newChatKeyword}
                onChange={(e) => setNewChatKeyword(e.target.value)}
              />
              <button onClick={handleCreateKeyword}>Add Keyword</button>
            </div>
            {keywordError && <div className="error">{keywordError}</div>}
            {keywordMsg && <div className="message">{keywordMsg}</div>}
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Keyword</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {chatKeywords.map((kw) => (
                  <tr key={kw.id}>
                    <td>{kw.id}</td>
                    <td>{kw.keyword}</td>
                    <td>
                      <button onClick={() => handleUpdateKeyword(kw.id, kw.keyword)}>Edit</button>
                      <button onClick={() => handleDeleteKeyword(kw.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flag-section">
            <h4>Flagged Objects</h4>
            <div className="form-container">
              <input
                type="text"
                placeholder="New Object Name"
                value={newFlaggedObject}
                onChange={(e) => setNewFlaggedObject(e.target.value)}
              />
              <button onClick={handleCreateObject}>Add Object</button>
            </div>
            {objectError && <div className="error">{objectError}</div>}
            {objectMsg && <div className="message">{objectMsg}</div>}
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Object Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flaggedObjects.map((obj) => (
                  <tr key={obj.id}>
                    <td>{obj.id}</td>
                    <td>{obj.object_name}</td>
                    <td>
                      <button onClick={() => handleUpdateObject(obj.id, obj.object_name)}>Edit</button>
                      <button onClick={() => handleDeleteObject(obj.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flag-section">
            <h4>Telegram Notifications</h4>
            <div className="form-container">
              <input
                type="text"
                placeholder="Telegram Username"
                value={newTelegramUsername}
                onChange={(e) => setNewTelegramUsername(e.target.value)}
              />
              <input
                type="text"
                placeholder="Chat ID"
                value={newTelegramChatId}
                onChange={(e) => setNewTelegramChatId(e.target.value)}
              />
              <button onClick={handleCreateTelegramRecipient}>Add Recipient</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Chat ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {telegramRecipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td>{recipient.telegram_username}</td>
                    <td>{recipient.chat_id}</td>
                    <td>
                      <button onClick={() => handleDeleteTelegramRecipient(recipient.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'scraper' && (
        <div className="tab-content">
          <h3>Scraper</h3>
          <ScraperPage />
        </div>
      )}

      {activeTab === 'visual' && (
        <div className="tab-content">
          <h3>Visual Test</h3>
          <VisualTestPage />
        </div>
      )}

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
              room_url={selectedAssignment.room_url} 
              streamer_username={selectedAssignment.streamer_username}
              alerts={detectionAlerts[selectedAssignment.room_url] || []}
            />
          </div>
        </div>
      )}

      {showAgentModal && (
        <div className="modal-overlay" onClick={() => setShowAgentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowAgentModal(false)}>X</button>
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

        .form-container {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .form-container input, 
        .form-container select {
          padding: 12px 18px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          flex: 1;
          color: #e0e0e0;
          transition: all 0.3s ease;
          min-width: 200px;
        }

        .form-container input:focus, 
        .form-container select:focus {
          border-color: #007bff;
          box-shadow: 0 0 10px rgba(0,123,255,0.3);
          outline: none;
        }

        .form-container button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .form-container button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,123,255,0.3);
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
        }

        table th {
          background: #007bff20;
          font-weight: 600;
        }

        .error {
          color: #ff4444;
          background: #ff444410;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ff444430;
          margin: 15px 0;
          animation: shake 0.4s ease;
        }

        .message {
          color: #28a745;
          background: #28a74510;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #28a74530;
          margin: 15px 0;
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

        .flag-section {
          margin-bottom: 40px;
          background: #252525;
          padding: 20px;
          border-radius: 12px;
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

        button {
          transition: all 0.3s ease;
          border: none;
          background: #007bff;
          color: white;
          padding: 8px 16px;
          border-radius: 6px;
        }

        button:hover {
          filter: brightness(1.1);
          transform: translateY(-2px);
        }

        button:active {
          transform: translateY(1px);
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        .create-agent-btn {
          margin-bottom: 20px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #28a745, #1e7e34);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .create-agent-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(40,167,69,0.3);
        }

        .modal-content h3 {
          margin-top: 0;
          margin-bottom: 20px;
          color: #e0e0e0;
        }

        .modal-content .form-container {
          flex-direction: column;
        }

        .modal-content .form-container input {
          width: 100%;
          margin-bottom: 10px;
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

        .notification-timestamp {
          font-size: 0.8em;
          color: #888;
          margin-top: 4px;
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