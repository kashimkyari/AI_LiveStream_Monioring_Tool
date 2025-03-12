import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

/**
 * HlsPlayer Component
 * 
 * A simple React component that uses HLS.js to load an HLS stream.
 * Assumes HLS.js is loaded globally via a script tag in index.html.
 */
const HlsPlayer = ({ src, ...props }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    let hls;
    const video = videoRef.current;

    if (video) {
      // If the browser supports HLS natively (e.g., Safari)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else if (window.Hls) {
        // Otherwise, use HLS.js if available
        hls = new window.Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, (event, data) => {
          console.error('HLS.js error:', data);
        });
      } else {
        console.error('HLS is not supported in this browser.');
      }
    }
    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      style={{ width: '100%', height: '100%' }}
      {...props}
    />
  );
};

/**
 * VideoPlayer Component
 * 
 * Renders a live video stream using either a thumbnail or an embedded player.
 * Uses platform-specific players for different streaming platforms.
 */
const VideoPlayer = ({ 
  streamer_username, 
  thumbnail = false, 
  alerts = [], 
  platform = 'chaturbate', // default platform set to 'chaturbate'
  streamerUid // Expected for Stripchat HLS stream URL
}) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [visibleAlerts, setVisibleAlerts] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [detections, setDetections] = useState([]);
  const retryTimeout = useRef(null);
  const detectionActive = useRef(false);

  // Object detection logic for thumbnails
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

  // Fetch thumbnail from the appropriate source based on platform
  const fetchThumbnail = useCallback(async () => {
    if (!isOnline || detectionActive.current || !thumbnail) return;

    try {
      detectionActive.current = true;
      const timestamp = Date.now();
      
      // Determine thumbnail URL based on platform
      let thumbnailUrl;
      if (platform.toLowerCase() === 'stripchat' && streamerUid) {
        // Use new Stripchat thumbnail URL
        thumbnailUrl = `https://img.doppiocdn.com/thumbs/1741753200/${streamerUid}_webp`;
      } else if (platform.toLowerCase() === 'chaturbate') {
        // Default to Chaturbate thumbnail URL
        thumbnailUrl = `https://jpeg.live.mmcdn.com/stream?room=${streamer_username}&t=${timestamp}`;
      } else {
        // Fallback thumbnail URL for other platforms
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
  }, [isOnline, streamer_username, thumbnail, detectObjects, platform, streamerUid]);

  // Handle offline state and retry logic
  const handleOfflineState = (error) => {
    console.error('Stream offline:', error);
    setThumbnailError(true);
    setIsOnline(false);
    clearTimeout(retryTimeout.current);
    
    const baseDelay = 60000 * Math.pow(2, 3); // 8 minutes max delay
    const jitter = Math.random() * 15000;
    retryTimeout.current = setTimeout(() => {
      setIsOnline(true);
      fetchThumbnail();
    }, baseDelay + jitter);
  };

  // Set interval to fetch thumbnails if in thumbnail mode
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

  // Merge alerts and detections after a slight delay
  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisibleAlerts([...alerts, ...detections]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [alerts, detections]);

  // Render embedded player depending on platform and provided props
  const renderEmbeddedPlayer = () => {
    if (platform.toLowerCase() === 'stripchat') {
      // Platform-specific embedded player for Stripchat using HLS
      if (streamerUid) {
        return (
          <div className="embedded-player-container">
            <HlsPlayer 
              src={`https://b-hls-06.doppiocdn.live/hls/${streamerUid}/${streamerUid}.m3u8`}
              className="embedded-player" 
            />
          </div>
        );
      }
      // Fallback to a clickable link if no streamerUid is available.
      return (
        <div className="no-embedded-player">
          <p>Embedded player is not supported on Stripchat without a valid streamer UID. Please click the link below to watch the live stream.</p>
          <a 
            href={`https://b-hls-06.doppiocdn.live/hls/${streamerUid}/${streamerUid}.m3u8`}
            target="_blank"
            rel="noopener noreferrer"
            className="stream-link"
          >
            Watch Live Stream
          </a>
        </div>
      );
    } else if (platform.toLowerCase() === 'chaturbate') {
      // Platform-specific embedded player for Chaturbate using an iframe
      return (
        <div className="embedded-player-container">
          <iframe
            src={`https://chaturbate.com/in/?room=${streamer_username}&autoplay=1`}
            className="embedded-player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
          />
        </div>
      );
    } else {
      // Fallback embedded player for other platforms
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
        .embedded-player-container,
        .no-embedded-player {
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

        .no-embedded-player {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #1a1a1a;
          color: #fff;
          text-align: center;
          padding: 20px;
        }

        .stream-link {
          margin-top: 10px;
          padding: 10px 20px;
          background: #007bff;
          color: #fff;
          border-radius: 4px;
          text-decoration: none;
          transition: background 0.3s ease;
        }

        .stream-link:hover {
          background: #0056b3;
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
