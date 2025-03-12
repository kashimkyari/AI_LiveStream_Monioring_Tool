import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const ChaturbateVideoPlayer = ({ 
  streamer_username, 
  thumbnail = false, 
  alerts = [], 
  platform = 'cbxyz' 
}) => {
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
      const thumbnailUrl = `https://jpeg.live.mmcdn.com/stream?room=${streamer_username}&t=${timestamp}`;
      
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
  }, [isOnline, streamer_username, thumbnail, detectObjects]);

  const handleOfflineState = (error) => {
    console.error('Stream offline:', error);
    setThumbnailError(true);
    setIsOnline(false);
    clearTimeout(retryTimeout.current);
    
    const baseDelay = 60000 * Math.pow(2, 3);
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

  return (
    <div className="video-player-container">
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
        <div className="embedded-player-wrapper">
          <iframe
            src={`https://cbxyz.com/in/?tour=SHBY&campaign=GoTLr&track=embed&room=${streamer_username}`}
            className="embedded-player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
          />
        </div>
      )}
    </div>
  );
};

export default ChaturbateVideoPlayer;