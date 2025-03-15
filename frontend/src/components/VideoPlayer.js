import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import axios from 'axios';
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const HlsPlayer = ({ m3u8Url, onDetection, isModalOpen }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Visual detection states
  const [flaggedObjects, setFlaggedObjects] = useState([]);
  const [notificationSent, setNotificationSent] = useState(false);
  
  // Audio detection states
  const [flaggedKeywords, setFlaggedKeywords] = useState([]);
  const [audioNotificationSent, setAudioNotificationSent] = useState(false);

  // Playback states
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0);
  const [isStreamLoaded, setIsStreamLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Refs for the detection model (coco-ssd)
  const modelRef = useRef(null);

  // Sync volume/mute state with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
    }
  }, [isMuted, volume]);

  // Load the coco-ssd model once on mount
  useEffect(() => {
    const loadCocoModel = async () => {
      try {
        modelRef.current = await cocoSsd.load();
        console.log("coco-ssd model loaded successfully");
      } catch (error) {
        console.error("Failed to load coco-ssd model:", error);
      }
    };
    loadCocoModel();
  }, []);

  // Fetch flagged objects from backend API (flag settings from admin panel)
  useEffect(() => {
    const fetchFlaggedObjects = async () => {
      try {
        const response = await fetch('/api/objects');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        // Convert to lower case for consistency.
        const flagged = data.map(item =>
          typeof item === 'string'
            ? item.toLowerCase()
            : item.object_name.toLowerCase()
        );
        setFlaggedObjects(flagged);
      } catch (error) {
        console.error("Error fetching flagged objects:", error);
        setFlaggedObjects([]);
      }
    };
    fetchFlaggedObjects();
  }, []);

  // Fetch flagged keywords from the backend API for audio detection
  useEffect(() => {
    const fetchFlaggedKeywords = async () => {
      try {
        const response = await fetch('/api/keywords');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        const keywords = data.map(item =>
          typeof item === 'string'
            ? item.toLowerCase()
            : item.keyword.toLowerCase()
        );
        setFlaggedKeywords(keywords);
      } catch (error) {
        console.error("Error fetching flagged keywords:", error);
        setFlaggedKeywords([]);
      }
    };
    fetchFlaggedKeywords();
  }, []);

  // Visual detection: process video frames and annotate flagged objects
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

    const detectObjects = async () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        updateCanvasSize();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw the current video frame onto the canvas before adding annotations.
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const predictions = [];

        // Advanced object detection via coco-ssd
        if (modelRef.current) {
          const cocoPredictions = await modelRef.current.detect(video);
          cocoPredictions.forEach(pred => {
            predictions.push({
              class: pred.class.toLowerCase(),
              score: pred.score,
              bbox: pred.bbox, // [x, y, width, height]
            });
          });
        }

        // Filter predictions: only include those that are flagged
        const flaggedPredictions = predictions.filter(prediction =>
          flaggedObjects.includes(prediction.class)
        );

        // Determine the detected object (highest confidence) from flagged predictions
        let detectedObject = null;
        if (flaggedPredictions.length > 0) {
          detectedObject = flaggedPredictions.reduce((prev, curr) =>
            prev.score > curr.score ? prev : curr
          ).class;
        }

        // Draw annotations for flagged predictions.
        flaggedPredictions.forEach(prediction => {
          const [x, y, width, height] = prediction.bbox;
          const label = `${prediction.class} (${(prediction.score * 100).toFixed(1)}%)`;
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);
          ctx.fillStyle = 'red';
          ctx.font = '14px Arial';
          ctx.fillText(label, x, y > 10 ? y - 5 : y + 15);
        });

        // Notify parent component with flagged detections.
        if (onDetection) onDetection(flaggedPredictions);

        // Send detection to backend for logging
        if (flaggedPredictions.length > 0 && !notificationSent) {
          // Create a hidden canvas to capture the image without annotations
          const hiddenCanvas = document.createElement('canvas');
          hiddenCanvas.width = video.videoWidth;
          hiddenCanvas.height = video.videoHeight;
          const hiddenCtx = hiddenCanvas.getContext('2d');
          hiddenCtx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

          // Capture the annotated frame from the canvas (video frame + annotations)
          const annotatedImage = canvas.toDataURL('image/jpeg', 0.8);
          const capturedImage = hiddenCanvas.toDataURL('image/jpeg', 0.8);

          axios.post('/api/detect-objects', {
            stream_url: m3u8Url,
            detections: flaggedPredictions,
            timestamp: new Date().toISOString(),
            annotated_image: annotatedImage,
            captured_image: capturedImage, // Image without annotations
            detected_object: detectedObject, // Detected object label
          });

          // Set notification sent to true and reset after 10 seconds
          setNotificationSent(true);
          setTimeout(() => setNotificationSent(false), 10000);
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
  }, [onDetection, flaggedObjects, m3u8Url, notificationSent]);

  // Audio processing: analyze audio stream for flagged keyword detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    // Ensure video is muted on frontend
    video.muted = true;

    const processAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      // If average amplitude exceeds threshold, simulate flagged keyword detection
      if (average > 100 && flaggedKeywords.length > 0 && !audioNotificationSent) {
        const detectedKeyword = flaggedKeywords[Math.floor(Math.random() * flaggedKeywords.length)];
        console.log("Audio detection: keyword", detectedKeyword);

        axios.post('/api/detect-keyword', {
          stream_url: m3u8Url,
          keyword: detectedKeyword,
          timestamp: new Date().toISOString()
        })
        .then(response => console.log("Audio detection logged:", response.data))
        .catch(error => console.error("Error sending audio detection:", error));

        setAudioNotificationSent(true);
        setTimeout(() => setAudioNotificationSent(false), 10000); // 10 sec cooldown
      }
      requestAnimationFrame(processAudio);
    };

    processAudio();

    return () => {
      audioCtx.close();
    };
  }, [flaggedKeywords, audioNotificationSent, m3u8Url]);

  // HLS player initialization logic
  useEffect(() => {
    let hls;
    if (!m3u8Url) {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage("Invalid stream URL");
      return;
    }

    const initializePlayer = () => {
      if (Hls.isSupported()) {
        hls = new Hls({ autoStartLoad: true, startLevel: -1, debug: false });
        hls.loadSource(m3u8Url);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          setIsStreamLoaded(true);
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
        videoRef.current.src = m3u8Url;
        videoRef.current.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          setIsStreamLoaded(true);
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
  }, [m3u8Url]);

  return (
    <div className="hls-player-container">
      {/* Live Indicator */}
      {isStreamLoaded && (
        <div className="live-indicator">
          <div className="red-dot"></div>
          <span className="live-text">LIVE</span>
        </div>
      )}

      {/* Volume Controls (in modal view) */}
      {isModalOpen && (
        <div className="volume-controls">
          <button 
            className="mute-button"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? '🔇' : volume > 0 ? '🔊' : '🔈'}
          </button>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => {
              const newVolume = parseFloat(e.target.value);
              setVolume(newVolume);
              if (newVolume > 0) setIsMuted(false);
            }}
          />
        </div>
      )}

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

      <style jsx>{`
        .hls-player-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        .live-indicator {
          position: absolute;
          top: 10px;
          left: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.7);
          padding: 4px 8px;
          border-radius: 4px;
          z-index: 10;
          color: white;
        }
        .red-dot {
          width: 8px;
          height: 8px;
          background: #ff0000;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        .volume-controls {
          position: absolute;
          bottom: 10px;
          right: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.7);
          padding: 8px;
          border-radius: 20px;
          z-index: 10;
        }
        .mute-button {
          background: none;
          border: none;
          cursor: pointer;
          color: white;
          font-size: 20px;
          padding: 0;
        }
        .volume-slider {
          width: 80px;
          height: 4px;
          accent-color: white;
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
      `}</style>
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
  const [m3u8Url, setM3u8Url] = useState(null);
  const [fetchedStreamerUsername, setFetchedStreamerUsername] = useState(null);

  // Fetch the m3u8 URL for both Chaturbate and Stripchat streams based on streamerName
  useEffect(() => {
    if (platform.toLowerCase() === 'chaturbate' && streamerName) {
      const fetchM3u8Url = async () => {
        try {
          const response = await fetch(`/api/streams?platform=chaturbate&streamer=${streamerName}`);
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          if (data.length > 0 && data[0].chaturbate_m3u8_url) {
            setM3u8Url(data[0].chaturbate_m3u8_url);
          } else {
            throw new Error("No m3u8 URL found for the stream");
          }
        } catch (error) {
          console.error("Error fetching m3u8 URL for Chaturbate:", error);
          setIsOnline(false);
        } finally {
          setLoading(false);
        }
      };
      fetchM3u8Url();
    } else if (platform.toLowerCase() === 'stripchat' && streamerName) {
      const fetchM3u8Url = async () => {
        try {
          const response = await fetch(`/api/streams?platform=stripchat&streamer=${streamerName}`);
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          if (data.length > 0 && data[0].stripchat_m3u8_url) {
            setM3u8Url(data[0].stripchat_m3u8_url);
            setFetchedStreamerUsername(data[0].streamer_username);
          } else {
            throw new Error("No m3u8 URL found for the stream");
          }
        } catch (error) {
          console.error("Error fetching m3u8 URL for Stripchat:", error);
          setIsOnline(false);
        } finally {
          setLoading(false);
        }
      };
      fetchM3u8Url();
    } else {
      setLoading(false);
    }
  }, [platform, streamerName, staticThumbnail]);

  const handleThumbnailError = () => {
    setIsOnline(false);
    setThumbnail(null);
  };

  const handleModalToggle = () => {
    setIsModalOpen(!isModalOpen);
  };

  const renderPlayer = (isModal) => {
    if (platform.toLowerCase() === 'stripchat') {
      return m3u8Url ? (
        <HlsPlayer m3u8Url={m3u8Url} onDetection={onDetection} isModalOpen={isModal} />
      ) : (
        <div className="error-message">No valid m3u8 URL provided for Stripchat.</div>
      );
    }
    if (platform.toLowerCase() === 'chaturbate') {
      return m3u8Url ? (
        <HlsPlayer m3u8Url={m3u8Url} onDetection={onDetection} isModalOpen={isModal} />
      ) : (
        <div className="error-message">No valid m3u8 URL provided for Chaturbate.</div>
      );
    }
    return <div className="error-message">Unsupported platform: {platform}.</div>;
  };

  return (
    <div className="video-container">
      {loading ? (
        <div className="loading-message">Loading...</div>
      ) : thumbnail && isOnline && !isModalOpen ? (
        <div className="thumbnail-wrapper">
          <img
            src={thumbnail}
            alt="Live stream thumbnail"
            className="thumbnail-image"
            onClick={handleModalToggle}
            onError={handleThumbnailError}
          />
          {!isOnline && (
            <div className="thumbnail-live-indicator">
              <span>Offline</span>
            </div>
          )}
        </div>
      ) : (
        renderPlayer(false)
      )}

      {!loading && !isOnline && (
        <div className="error-message">
          {platform.toLowerCase() === 'stripchat'
            ? 'Stripchat stream is offline.'
            : 'Chaturbate stream is offline.'}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleModalToggle}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {renderPlayer(true)}
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
          object-fit: cover;
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
        .thumbnail-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
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
        .thumbnail-live-indicator {
          position: absolute;
          top: 10px;
          left: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.7);
          padding: 4px 8px;
          border-radius: 4px;
          color: white;
          z-index: 2;
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
