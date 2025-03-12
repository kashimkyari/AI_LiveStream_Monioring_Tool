import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FlagSettingsPage = () => {
  const [chatKeywords, setChatKeywords] = useState([]);
  const [newChatKeyword, setNewChatKeyword] = useState('');
  const [keywordMsg, setKeywordMsg] = useState('');
  const [keywordError, setKeywordError] = useState('');
  
  const [flaggedObjects, setFlaggedObjects] = useState([]);
  const [newFlaggedObject, setNewFlaggedObject] = useState('');
  const [objectMsg, setObjectMsg] = useState('');
  const [objectError, setObjectError] = useState('');
  
  const [telegramRecipients, setTelegramRecipients] = useState([]);
  const [newTelegramUsername, setNewTelegramUsername] = useState('');
  const [newTelegramChatId, setNewTelegramChatId] = useState('');

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
    fetchKeywords();
    fetchObjects();
    fetchTelegramRecipients();
  }, []);

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

  return (
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

      <style jsx>{`
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

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        .message {
          color: #28a745;
          background: #28a74510;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #28a74530;
          margin: 15px 0;
        }

        .flag-section {
          margin-bottom: 40px;
          background: #252525;
          padding: 20px;
          border-radius: 12px;
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

        @media (max-width: 768px) {
          .form-container {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default FlagSettingsPage;