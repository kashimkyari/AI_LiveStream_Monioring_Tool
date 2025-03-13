import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import IframePlayer from './IframePlayer';

// TensorFlow and models
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as handpose from '@tensorflow-models/handpose';
import * as bodyPix from '@tensorflow-models/body-pix';

const HlsPlayer = ({ streamerUid, onDetection }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Refs for the detection models
  const modelRef = useRef(null); // coco-ssd
  const handposeModelRef = useRef(null);
  const bodyPixModelRef = useRef(null);

  // New state: holds flagged objects from admin panel settings
  const [flaggedObjects, setFlaggedObjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Correct streamerUid if needed
  const actualStreamerUid = streamerUid !== "${streamerUid}" ? streamerUid : "";
  const hlsUrl = actualStreamerUid
    ? `https://b-hls-11.doppiocdn.live/hls/${actualStreamerUid}/${actualStreamerUid}.m3u8`
    : "";

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

  // Load additional detection models: handpose and BodyPix (for body segmentation)
  useEffect(() => {
    const loadAdditionalModels = async () => {
      try {
        const handposeModel = await handpose.load();
        handposeModelRef.current = handposeModel;
        console.log("Handpose model loaded successfully");
      } catch (error) {
        console.error("Failed to load handpose model:", error);
      }
      try {
        const bodyPixModel = await bodyPix.load();
        bodyPixModelRef.current = bodyPixModel;
        console.log("BodyPix model loaded successfully");
      } catch (error) {
        console.error("Failed to load BodyPix model:", error);
      }
    };
    loadAdditionalModels();
  }, []);

  // Fetch flagged objects from the backend API (flag settings from admin panel)
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



  // Real-time detection logic using multiple TensorFlow.js models
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

    // Function to detect objects on the current video frame using all models
    const detectObjects = async () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        updateCanvasSize();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        // Hand pose detection
        if (handposeModelRef.current) {
          const handPredictions = await handposeModelRef.current.estimateHands(video);
          handPredictions.forEach(pred => {
            const topLeft = pred.boundingBox.topLeft;
            const bottomRight = pred.boundingBox.bottomRight;
            const x = topLeft[0];
            const y = topLeft[1];
            const width = bottomRight[0] - topLeft[0];
            const height = bottomRight[1] - topLeft[1];
            predictions.push({
              class: 'hand',
              score: pred.handInViewConfidence,
              bbox: [x, y, width, height],
            });
          });
        }

        // Body segmentation detection (using BodyPix)
        if (bodyPixModelRef.current) {
          const segmentation = await bodyPixModelRef.current.segmentPerson(video, {
            internalResolution: 'medium',
            segmentationThreshold: 0.7,
          });
          // Compute bounding box from segmentation mask
          let minX = segmentation.width, minY = segmentation.height, maxX = 0, maxY = 0;
          let found = false;
          for (let i = 0; i < segmentation.data.length; i++) {
            if (segmentation.data[i] === 1) { // 1 indicates a person pixel
              found = true;
              const x = i % segmentation.width;
              const y = Math.floor(i / segmentation.width);
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
          if (found) {
            // Scale the bounding box coordinates to the video dimensions.
            const scaleX = video.videoWidth / segmentation.width;
            const scaleY = video.videoHeight / segmentation.height;
            const bbox = [
              minX * scaleX,
              minY * scaleY,
              (maxX - minX) * scaleX,
              (maxY - minY) * scaleY,
            ];
            predictions.push({
              class: 'person',
              score: 1.0, // Fixed score for segmentation
              bbox,
            });
          }
        }

        // Filter predictions: only include those that are flagged
        const flaggedPredictions = predictions.filter(prediction =>
          flaggedObjects.includes(prediction.class)
        );

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

        // Send Telegram notification if flagged objects are detected.
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
  }, [onDetection, flaggedObjects]);

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
          {platform === 'stripchat'
            ? 'Stripchat stream is offline.'
            : 'Chaturbate stream is offline.'}
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
