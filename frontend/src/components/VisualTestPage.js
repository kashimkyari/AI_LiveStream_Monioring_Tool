import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const VisualTestPage = () => {
  // Existing manual detection states
  const [videoFile, setVideoFile] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const [detections, setDetections] = useState([]);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);

  // Improved SSE handling
  const eventSourceRef = useRef(null);

  // New reconnect logic
  const setupEventSource = () => {
    eventSourceRef.current = new EventSource('/api/test/visual/stream');
    
    eventSourceRef.current.onmessage = (event) => {
      setError('');
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          return;
        }
        setRealtimeDetections(data);
      } catch (err) {
        console.error('Error parsing SSE data:', err);
        setError('Invalid detection data format');
      }
    };

    eventSourceRef.current.onerror = (err) => {
      console.error('SSE Error:', err);
      setError('Reconnecting to detection stream...');
      eventSourceRef.current?.close();
      setTimeout(setupEventSource, 3000);  // Reconnect after 3 seconds
    };
  };

  useEffect(() => {
    setupEventSource();
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // New state for realtime detections via SSE
  const [realtimeDetections, setRealtimeDetections] = useState([]);

  // Handle file selection and set video URL for playback (manual detection)
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      setVideoURL(URL.createObjectURL(e.target.files[0]));
    }
  };

  // Capture current frame from video and send for detection (manual mode)
  const captureFrameAndDetect = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const formData = new FormData();
      formData.append('frame', blob, 'frame.jpg');
      try {
        const res = await axios.post('/api/test/visual/frame', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        setDetections(res.data.results);
      } catch (err) {
        console.error('Detection error:', err);
      }
    }, 'image/jpeg');
  };

  // Start capturing frames when video plays (manual detection)
  const startDetection = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(captureFrameAndDetect, 1000); // capture every second
  };

  // Stop capturing frames when video is paused or ended (manual detection)
  const stopDetection = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Cleanup on unmount (manual detection)
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoURL) URL.revokeObjectURL(videoURL);
    };
  }, [videoURL]);

  // New useEffect to subscribe to realtime detection via SSE
  useEffect(() => {
    const eventSource = new EventSource('/api/test/visual/stream');

    eventSource.onmessage = (event) => {
      try {
        // Expecting a JSON array from the backend
        const data = JSON.parse(event.data);
        setRealtimeDetections(data);
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      setError('Realtime detection connection error.');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="visual-test-page">
      <h2>Real-Time Visual Detection Test</h2>

      {/* Manual File Upload & Detection Section */}
      <div className="form-container">
        <input type="file" accept="video/*" onChange={handleFileChange} />
      </div>
      {videoURL && (
        <div className="video-container">
          <video
            ref={videoRef}
            src={videoURL}
            controls
            onPlay={startDetection}
            onPause={stopDetection}
            onEnded={stopDetection}
            style={{ width: '100%' }}
          />
          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      
      <div className="detections">
        <h3>Manual Detection Results:</h3>
        {detections && detections.length > 0 ? (
          <ul>
            {detections.map((det, index) => (
              <li key={index}>
                <strong>Class:</strong> {det.class} | <strong>Confidence:</strong>{' '}
                {(det.confidence * 100).toFixed(2)}%
              </li>
            ))}
          </ul>
        ) : (
          <p>No manual detections yet...</p>
        )}
      </div>

      {/* New Realtime Detection Section via SSE */}
      <div className="detections realtime">
        <h3>Realtime Detection Results:</h3>
        {realtimeDetections && realtimeDetections.length > 0 ? (
          <ul>
            {realtimeDetections.map((det, index) => (
              <li key={index}>
                <strong>Class:</strong> {det.class} | <strong>Confidence:</strong>{' '}
                {(det.confidence * 100).toFixed(2)}%
              </li>
            ))}
          </ul>
        ) : (
          <p>No realtime detections yet...</p>
        )}
      </div>

      <style jsx>{`
        .visual-test-page {
          max-width: 900px;
          margin: 40px auto;
          padding: 30px;
          background: #1a1a1a;
          border-radius: 15px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
          font-family: 'Inter', sans-serif;
          color: #e0e0e0;
          border: 1px solid #2d2d2d;
          animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .form-container {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .form-container input {
          padding: 12px 18px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          flex: 1;
          color: #e0e0e0;
          transition: all 0.3s ease;
          min-width: 200px;
        }
        .form-container input:focus {
          border-color: #007bff;
          box-shadow: 0 0 10px rgba(0, 123, 255, 0.3);
          outline: none;
        }
        .video-container {
          margin-top: 20px;
        }
        .detections {
          margin-top: 20px;
          background: #2d2d2d;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #3d3d3d;
        }
        .detections h3 {
          margin-bottom: 10px;
        }
        .detections ul {
          list-style: none;
          padding: 0;
        }
        .detections li {
          padding: 8px 0;
          border-bottom: 1px solid #3d3d3d;
        }
        .detections li:last-child {
          border-bottom: none;
        }
        .detections.realtime {
          margin-top: 40px;
        }
        .error {
          color: #ff4444;
          background: #ff444410;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ff444430;
          margin-top: 15px;
          text-align: center;
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default VisualTestPage;
