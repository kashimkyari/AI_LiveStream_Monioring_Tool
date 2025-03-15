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

  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramMsg, setTelegramMsg] = useState('');
  const [telegramError, setTelegramError] = useState('');

  // Fetch chat keywords
  const fetchKeywords = async () => {
    try {
      const res = await axios.get('/api/keywords');
      setChatKeywords(res.data);
    } catch (error) {
      console.error('Error fetching keywords:', error);
    }
  };

  // Fetch flagged objects
  const fetchObjects = async () => {
    try {
      const res = await axios.get('/api/objects');
      setFlaggedObjects(res.data);
    } catch (error) {
      console.error('Error fetching objects:', error);
    }
  };

  // Fetch Telegram recipients
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

  // Handle creating a new chat keyword
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

  // Handle updating a chat keyword
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

  // Handle deleting a chat keyword
  const handleDeleteKeyword = async (keywordId) => {
    try {
      await axios.delete(`/api/keywords/${keywordId}`);
      fetchKeywords();
    } catch (error) {
      console.error('Error deleting keyword:', error);
    }
  };

  // Handle creating a new flagged object
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

  // Handle updating a flagged object
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

  // Handle deleting a flagged object
  const handleDeleteObject = async (objectId) => {
    try {
      await axios.delete(`/api/objects/${objectId}`);
      fetchObjects();
    } catch (error) {
      console.error('Error deleting object:', error);
    }
  };

  // Handle creating a new Telegram recipient
  const handleCreateTelegramRecipient = async () => {
    try {
      await axios.post('/api/telegram_recipients', {
        telegram_username: newTelegramUsername,
        chat_id: newTelegramChatId,
      });
      fetchTelegramRecipients();
      setNewTelegramUsername('');
      setNewTelegramChatId('');
    } catch (error) {
      console.error('Error adding recipient:', error);
    }
  };

  // Handle deleting a Telegram recipient
  const handleDeleteTelegramRecipient = async (recipientId) => {
    try {
      await axios.delete(`/api/telegram_recipients/${recipientId}`);
      fetchTelegramRecipients();
    } catch (error) {
      console.error('Error deleting recipient:', error);
    }
  };

  // Handle sending a message to all Telegram recipients
  const handleSendTelegramMessage = async () => {
    setTelegramError('');
    setTelegramMsg('');
    if (!telegramMessage.trim()) {
      setTelegramError('Message is required.');
      return;
    }
    try {
      const res = await axios.post('/api/send-telegram-message', { message: telegramMessage });
      setTelegramMsg(res.data.message);
      setTelegramMessage('');
    } catch (error) {
      setTelegramError(error.response?.data.message || 'Error sending message.');
    }
  };

  return (
    <div className="tab-content">
      <h3>Flag Settings</h3>

      {/* Chat Keywords Section */}
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

      {/* Flagged Objects Section */}
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

      {/* Telegram Recipients Section */}
      <div className="flag-section">
        <h4>Telegram Recipients</h4>
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

      {/* Send Message to All Telegram Recipients Section */}
      <div className="flag-section">
        <h4>Send Message to All Telegram Recipients</h4>
        <div className="form-container">
          <textarea
            placeholder="Enter your message here"
            value={telegramMessage}
            onChange={(e) => setTelegramMessage(e.target.value)}
            rows={5}
          />
          <button onClick={handleSendTelegramMessage}>Send Message to All Telegram Users</button>
        </div>
        {telegramError && <div className="error">{telegramError}</div>}
        {telegramMsg && <div className="message">{telegramMsg}</div>}
      </div>

      {/* Styles */}
      <style jsx>{`
        .tab-content {
          margin-top: 25px;
          animation: fadeIn 0.4s ease;
        }

        .flag-section {
          margin-bottom: 40px;
          background: #252525;
          padding: 20px;
          border-radius: 12px;
        }

        .form-container {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        input, textarea {
          padding: 12px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          color: #e0e0e0;
          font-family: inherit;
          font-size: 14px;
          flex: 1;
        }

        textarea {
          width: 100%;
          resize: vertical;
        }

        button {
          padding: 12px 24px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s ease;
        }

        button:hover {
          background: #0056b3;
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
          margin-top: 10px;
        }

        .message {
          color: #28a745;
          margin-top: 10px;
        }
      `}</style>
    </div>
  );
};

export default FlagSettingsPage;