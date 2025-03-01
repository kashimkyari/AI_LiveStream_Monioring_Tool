import React, { useState } from 'react';
import axios from 'axios';

const TestingTab = () => {
  const [visualAI, setVisualAI] = useState(true);
  const [audioAI, setAudioAI] = useState(true);
  const [chatAI, setChatAI] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [testMessage, setTestMessage] = useState('');

  const handleToggleTest = async () => {
    try {
      const res = await axios.post('/api/test', {
        visual_ai: visualAI,
        audio_ai: audioAI,
        chat_ai: chatAI,
        notifications
      });
      setTestMessage(res.data.message);
    } catch (error) {
      setTestMessage('Error testing features');
    }
  };

  return (
    <div className="testing-tab">
      <h3>Feature Testing</h3>
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={visualAI} onChange={() => setVisualAI(!visualAI)} />
          Visual AI
        </label>
      </div>
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={audioAI} onChange={() => setAudioAI(!audioAI)} />
          Audio AI
        </label>
      </div>
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={chatAI} onChange={() => setChatAI(!chatAI)} />
          Chat AI
        </label>
      </div>
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={notifications} onChange={() => setNotifications(!notifications)} />
          Notifications
        </label>
      </div>
      <button onClick={handleToggleTest}>Run Test</button>
      {testMessage && <p className="test-message">{testMessage}</p>}
      <style jsx>{`
        .testing-tab {
          margin-top: 20px;
        }
        .toggle-row {
          margin: 10px 0;
        }
        .test-message {
          margin-top: 15px;
          color: #555;
        }
      `}</style>
    </div>
  );
};

export default TestingTab;

