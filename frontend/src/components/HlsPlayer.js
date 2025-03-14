import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import axios from 'axios';

// TensorFlow and models
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as handpose from '@tensorflow-models/handpose';
import * as bodyPix from '@tensorflow-models/body-pix';

const HlsPlayer = ({ streamerUid, onDetection, streamerName, platform, assignedAgent }) => {
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

  // State to track if a notification has been sent recently
  const [notificationSent, setNotificationSent] = useState(false);

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

        // Send detection to backend for logging
        if (flaggedPredictions.length > 0 && !notificationSent) {
          // Capture the annotated frame
          const annotatedImage = canvas.toDataURL('image/jpeg', 0.8);

          // Prepare detection details
          const detectionDetails = {
            stream_url: hlsUrl,
            detections: flaggedPredictions,
            timestamp: new Date().toISOString(),
            annotated_image: annotatedImage,
            streamer_name: streamerName,
            platform: platform,
            assigned_agent: assignedAgent ? {
              username: assignedAgent.username,
              phone_number: assignedAgent.phonenumber
            } : null,
            detected_object: flaggedPredictions[0].class // Only send the first detected object
          };

          axios.post('/api/detect-objects', detectionDetails);

          // Set notification sent to true and reset after 10 seconds
          setNotificationSent(true);
          setTimeout(() => setNotificationSent(false), 10000); // 10 seconds cooldown
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
  }, [onDetection, flaggedObjects, hlsUrl, notificationSent, streamerName, platform, assignedAgent]);

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

export default HlsPlayer;