import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const VideoPlayer = ({ streamer_username, thumbnail = false, alerts = [], platform = 'cbxyz' }) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [visibleAlerts, setVisibleAlerts] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [detections, setDetections] = useState([]);
  const retryTimeout = useRef(null);
  const detectionActive = useRef(false);

  const detectObjects = useCallback(async (imageUrl) => {
    try {
      const base64Data = imageUrl.split(',')[1];
      const response = await axios.post('/api/detect-objects', {
        image_data: base64Data,
        streamer: streamer_username
      });
      return response.data.detections || [];
    } catch (error) {
      console.error('AI detection error:', error);
      return [];
    }
  }, [streamer_username]);

  const fetchThumbnail = useCallback(async () => {
    if (!isOnline || detectionActive.current || !thumbnail) return;

    try {
      detectionActive.current = true;
      const timestamp = Date.now();
      
      // Use different thumbnail endpoints based on platform
      let thumbnailUrl;
      if (platform.toLowerCase() === 'stripchat') {
        thumbnailUrl = `https://img.strpst.com/thumbs/${streamer_username}?t=${timestamp}`;
      } else {
        thumbnailUrl = `https://jpeg.live.mmcdn.com/stream?room=${streamer_username}&t=${timestamp}`;
      }
      
      const res = await fetch(thumbnailUrl);
      
      if (!res.ok) throw new Error('Stream offline');
      
      const blob = await res.blob();
      const reader = new FileReader();
      
      reader.onload = async () => {
        const imageUrl = reader.result;
        setCurrentFrame(imageUrl);
        setThumbnailError(false);
        
        const aiDetections = await detectObjects(imageUrl);
        setDetections(aiDetections);
        setIsOnline(true);
      };
      
      reader.readAsDataURL(blob);
    } catch (error) {
      handleOfflineState(error);
    } finally {
      detectionActive.current = false;
    }
  }, [isOnline, streamer_username, thumbnail, detectObjects, platform]);

  const handleOfflineState = (error) => {
    console.error('Stream offline:', error);
    setThumbnailError(true);
    setIsOnline(false);
    clearTimeout(retryTimeout.current);
    
    const baseDelay = 60000 * Math.pow(2, 3); // 8 minutes max
    const jitter = Math.random() * 15000;
    retryTimeout.current = setTimeout(() => {
      setIsOnline(true);
      fetchThumbnail();
    }, baseDelay + jitter);
  };

  useEffect(() => {
    if (thumbnail) {
      fetchThumbnail();
      const interval = setInterval(fetchThumbnail, isOnline ? 200 : 600);
      return () => {
        clearInterval(interval);
        clearTimeout(retryTimeout.current);
      };
    }
  }, [thumbnail, isOnline, fetchThumbnail]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisibleAlerts([...alerts, ...detections]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [alerts, detections]);

  const renderEmbeddedPlayer = () => {
    if (platform.toLowerCase() === 'stripchat') {
      return (
        <div className="embedded-player-container">
          <iframe
            src={`https://stripchat.com/embed/${streamer_username}`}
            className="embedded-player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
          />
        </div>
      );
    } else {
      return (
        <div className="embedded-player-container">
          <iframe
            src={`https://cbxyz.com/in/?tour=SHBY&campaign=GoTLr&track=embed&room=${streamer_username}`}
            className="embedded-player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
          />
        </div>
      );
    }
  };

  return (
    <div className="video-container">
      {thumbnail ? (
        <div className="thumbnail-wrapper">
          {currentFrame && !thumbnailError ? (
            <img
              src={currentFrame}
              alt="Live stream thumbnail"
              className="thumbnail-image"
              onError={() => setThumbnailError(true)}
            />
          ) : (
            <div className="thumbnail-fallback">
              <span>{isOnline ? 'Loading...' : 'Offline (Retrying)'}</span>
            </div>
          )}
        </div>
      ) : (
        renderEmbeddedPlayer()
      )}

      <div className="detection-overlay">
        {visibleAlerts.map((detection, index) => (
          <div 
            key={`${detection.class}-${index}`}
            className={`alert-marker ${detection.source === 'chat' ? 'chat-alert' : 'ai-alert'}`}
            style={{
              left: `${detection.box[0]}%`,
              top: `${detection.box[1]}%`,
              width: `${detection.box[2] - detection.box[0]}%`,
              height: `${detection.box[3] - detection.box[1]}%`
            }}
          >
            <div className={`alert-label ${detection.source === 'chat' ? 'chat-label' : 'ai-label'}`}>
              {detection.source === 'ai' ? (
                `${detection.class} (${(detection.confidence * 100).toFixed(1)}%)`
              ) : (
                `⚠️ ${detection.class.replace('CHAT: ', '')}`
              )}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .video-container {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .thumbnail-wrapper,
        .embedded-player-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .thumbnail-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: opacity 0.3s ease;
        }

        .thumbnail-fallback {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #333;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 0.9em;
          animation: fadeIn 0.5s ease;
        }

        .embedded-player {
          width: 100%;
          height: 100%;
          border: none;
          background: #000;
        }

        .detection-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }

        .alert-marker {
          position: absolute;
          border: 2px solid;
          background: transparent;
          transition: all 0.3s ease;
          transform: translateZ(0);
          animation: pulseBox 1.5s infinite;
        }

        .alert-marker.chat-alert {
          border-color: #44ff44aa;
          background: #44ff4422;
        }

        .alert-marker.ai-alert {
          border-color: #ffa500aa;
          background: #ffa50022;
        }

        .alert-label {
          position: absolute;
          bottom: 100%;
          left: 0;
          color: white;
          padding: 4px 8px;
          font-size: 0.8em;
          border-radius: 4px;
          white-space: nowrap;
          backdrop-filter: blur(2px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          animation: slideIn 0.3s ease-out;
        }

        .chat-label {
          background: #44ff44dd;
        }

        .ai-label {
          background: #ffa500dd;
        }

        @keyframes pulseBox {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }

        @keyframes slideIn {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @media (max-width: 768px) {
          .video-container {
            padding-top: 75%;
            border-radius: 0;
          }
          
          .alert-label {
            font-size: 0.7em;
            padding: 2px 4px;
          }
        }
      `}</style>
    </div>
  );
};

export default VideoPlayer;