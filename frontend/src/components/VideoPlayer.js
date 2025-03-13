import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import IframePlayer from './IframePlayer';

// Import TensorFlow.js core and the coco-ssd model for object detection.
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const HlsPlayer = ({ streamerUid, onDetection }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null); // Holds the loaded coco-ssd model

  // State to hold allowed objects fetched from the backend API
  const [allowedObjects, setAllowedObjects] = useState([]);
  // New state: holds flagged objects from admin panel settings
  const [flaggedObjects, setFlaggedObjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Correct streamerUid if needed
  const actualStreamerUid = streamerUid !== "${streamerUid}" ? streamerUid : "";
  const hlsUrl = actualStreamerUid ? `https://b-hls-11.doppiocdn.live/hls/${actualStreamerUid}/${actualStreamerUid}.m3u8` : "";

  // Load the coco-ssd model once on mount
  useEffect(() => {
    const loadModel = async () => {
      try {
        modelRef.current = await cocoSsd.load();
        console.log("coco-ssd model loaded successfully");
      } catch (error) {
        console.error("Failed to load coco-ssd model:", error);
      }
    };
    loadModel();
  }, []);

  // Fetch allowed objects list from the backend API
  useEffect(() => {
    const fetchAllowedObjects = async () => {
      try {
        const response = await fetch('/api/objects');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setAllowedObjects(data);
      } catch (error) {
        console.error("Error fetching allowed objects:", error);
        setAllowedObjects([]);
      }
    };
    fetchAllowedObjects();
  }, []);

  // Fetch flagged objects from the backend API (flag settings from admin panel)
  useEffect(() => {
    const fetchFlaggedObjects = async () => {
      try {
        const response = await fetch('/api/flagged-objects');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        // Assuming data is an array of strings or objects with an object_name field.
        const flagged = data.map(item =>
          typeof item === 'string' ? item.toLowerCase() : item.object_name.toLowerCase()
        );
        setFlaggedObjects(flagged);
      } catch (error) {
        console.error("Error fetching flagged objects:", error);
        setFlaggedObjects([]);
      }
    };
    fetchFlaggedObjects();
  }, []);

  // Function to send detection event to backend for Telegram notifications.
  // This endpoint is assumed to trigger the send_full_telegram_notification_sync in the backend.
  const notifyDetection = async (detections) => {
    try {
      await fetch('/api/log-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamerUid: actualStreamerUid,
          detections,
          timestamp: new Date().toISOString(),
        }),
      });
      console.log("Detection event sent for notification");
    } catch (error) {
      console.error("Error sending detection notification:", error);
    }
  };

  // Real-time object detection logic using the coco-ssd model
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    let detectionInterval;

    // Update canvas size to match video display dimensions
    const updateCanvasSize = () => {
      if (!video.parentElement) return;
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    // Function to detect objects on the current video frame using coco-ssd
    const detectObjects = async () => {
      try {
        if (!modelRef.current) {
          console.warn("coco-ssd model not loaded yet");
          return;
        }
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        
        // Run object detection on the video frame.
        const predictions = await modelRef.current.detect(video);
        updateCanvasSize();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Filter predictions: only include objects from the allowed list that meet the threshold.
        const filteredPredictions = predictions.filter(prediction => {
          const allowed = allowedObjects.find(
            obj => obj.object_name.toLowerCase() === prediction.class.toLowerCase()
          );
          return allowed && prediction.score >= allowed.confidence_threshold;
        });

        // Draw annotations for filtered predictions.
        filteredPredictions.forEach(prediction => {
          const [x, y, width, height] = prediction.bbox;
          const scaleX = canvas.width / video.videoWidth;
          const scaleY = canvas.height / video.videoHeight;
          const label = `${prediction.class} (${(prediction.score * 100).toFixed(1)}%)`;

          if (height / width >= 1.5) {
            const newWidth = width * scaleX * 0.33; // roughly one-third of original width
            const centerX = (x + width / 2) * scaleX;
            const newX = centerX - newWidth / 2;
            const newY = y * scaleY;
            const newHeight = height * scaleY;
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(newX, newY, newWidth, newHeight);
            ctx.fillStyle = 'red';
            ctx.font = '14px Arial';
            ctx.fillText(label, newX, newY - 5);
          } else {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
            ctx.fillStyle = 'red';
            ctx.font = '14px Arial';
            ctx.fillText(label, x * scaleX, (y * scaleY) > 10 ? (y * scaleY - 5) : (y * scaleY + 15));
          }
        });

        // Notify parent component with all allowed detections.
        if (onDetection) onDetection(filteredPredictions);

        // Filter flagged predictions based on admin panel flag settings.
        const flaggedPredictions = filteredPredictions.filter(prediction =>
          flaggedObjects.includes(prediction.class.toLowerCase())
        );

        // Send Telegram notification only if flagged objects are detected.
        if (flaggedPredictions.length > 0) {
          notifyDetection(flaggedPredictions);
        }
      } catch (error) {
        console.error("Detection error:", error);
      }
    };

    const handlePlay = () => {
      updateCanvasSize();
      detectionInterval = setInterval(detectObjects, 1000); // Detect objects every second
    };

    const handlePause = () => {
      clearInterval(detectionInterval);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handlePause);
      clearInterval(detectionInterval);
    };
  }, [onDetection, allowedObjects, flaggedObjects]);

  // HLS player initialization logic
  useEffect(() => {
    let hls;
    if (!hlsUrl) {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage("Invalid streamer UID");
      return;
    }

    const initializePlayer = () => {
      if (Hls.isSupported()) {
        hls = new Hls({ autoStartLoad: true, startLevel: -1, debug: false });
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          videoRef.current.play().catch(console.error);
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            setHasError(true);
            setIsLoading(false);
            setErrorMessage(data.details || 'Playback error');
          }
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
        videoRef.current.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          videoRef.current.play().catch(console.error);
        });
      } else {
        setHasError(true);
        setIsLoading(false);
        setErrorMessage("HLS not supported");
      }
    };

    initializePlayer();
    return () => hls?.destroy();
  }, [hlsUrl, streamerUid]);

  return (
    <div className="hls-player-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading stream...</div>
        </div>
      )}

      {hasError && (
        <div className="error-overlay">
          <div className="error-icon">⚠️</div>
          <div className="error-text">{errorMessage}</div>
        </div>
      )}

      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%' }}
      />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

const VideoPlayer = ({
  platform = "stripchat", 
  streamerUid,
  streamerName,
  staticThumbnail,
  onDetection,
}) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (platform.toLowerCase() === 'stripchat' && staticThumbnail) {
      setLoading(false);
    } else if (platform.toLowerCase() === 'chaturbate' && streamerName) {
      const timestamp = Date.now();
      const chaturbateThumbnail = `https://thumb.live.mmcdn.com/ri/${streamerName}.jpg?${timestamp}`;
      setThumbnail(chaturbateThumbnail);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [platform, streamerUid, streamerName, staticThumbnail]);

  const handleThumbnailError = () => {
    setIsOnline(false);
    setThumbnail(null);
  };

  const handleModalToggle = () => {
    setIsModalOpen(!isModalOpen);
  };

  const renderPlayer = () => {
    if (platform.toLowerCase() === 'stripchat') {
      if (streamerUid) {
        return <HlsPlayer streamerUid={streamerUid} onDetection={onDetection} />;
      } else {
        return <div className="error-message">No valid streamer UID provided for Stripchat.</div>;
      }
    } else if (platform.toLowerCase() === 'chaturbate') {
      if (streamerName) {
        return <IframePlayer streamerName={streamerName} />;
      } else {
        return <div className="error-message">No valid streamer name provided for Chaturbate.</div>;
      }
    } else {
      return <div className="error-message">Unsupported platform: {platform}.</div>;
    }
  };

  return (
    <div className="video-container">
      {loading ? (
        <div className="loading-message">Loading...</div>
      ) : thumbnail && isOnline && !isModalOpen ? (
        <img
          src={thumbnail}
          alt="Live stream thumbnail"
          className="thumbnail-image"
          onClick={handleModalToggle}
          onError={handleThumbnailError}
        />
      ) : (
        renderPlayer()
      )}

      {!loading && !isOnline && (
        <div className="error-message">
          {platform === 'stripchat' ? 'Stripchat stream is offline.' : 'Chaturbate stream is offline.'}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleModalToggle}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {renderPlayer()}
            <button className="close-modal" onClick={handleModalToggle}>
              &times;
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .video-container {
          position: relative;
          width: 100%;
          height: 0;
          padding-top: 56.25%;
          overflow: hidden;
          background: #000;
          border-radius: 8px;
        }

        .loading-message {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background: #000;
        }

        .thumbnail-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          cursor: pointer;
        }

        .error-message {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background: rgba(0, 0, 0, 0.7);
          font-size: 1em;
          text-align: center;
          padding: 20px;
        }

        .hls-player-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          z-index: 5;
        }

        .error-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          z-index: 5;
          color: white;
        }

        .error-icon {
          font-size: 32px;
          margin-bottom: 10px;
        }

        .error-text {
          text-align: center;
          max-width: 80%;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top: 4px solid white;
          animation: spin 1s linear infinite;
        }

        .loading-text {
          color: white;
          margin-top: 10px;
          font-size: 14px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          position: relative;
          width: 90%;
          max-width: 1200px;
          background: #1a1a1a;
          border-radius: 8px;
          padding: 20px;
        }

        .close-modal {
          position: absolute;
          top: 10px;
          right: 10px;
          background: transparent;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
        }

        .close-modal:hover {
          color: #ff4444;
        }
      `}</style>
    </div>
  );
};

export default VideoPlayer;
