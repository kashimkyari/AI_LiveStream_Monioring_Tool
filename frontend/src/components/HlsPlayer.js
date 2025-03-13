import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import IframePlayer from './IframePlayer';

const HlsPlayer = ({ streamerUid, onDetection }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const actualStreamerUid = streamerUid !== "${streamerUid}" ? streamerUid : "";
  const hlsUrl = actualStreamerUid ? `https://b-hls-11.doppiocdn.live/hls/${actualStreamerUid}/${actualStreamerUid}.m3u8` : "";
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [detections, setDetections] = useState([]);

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
        hls = new Hls({
          autoStartLoad: true,
          startLevel: -1,
          debug: false,
          maxBufferLength: 30,
        });
        
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          setHasError(false);
          videoRef.current.muted = true; // Ensure the video is muted for autoplay
          videoRef.current.play().catch(error => {
            console.error('Autoplay failed:', error);
          });
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.details === "Maybe Offline") {
            setErrorMessage(`Stream cannot be loaded (${data.response ? data.response.code : 'unknown error'})`);
            setHasError(true);
            setIsLoading(false);
          }
          
          if (data.fatal) {
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (data.details !== "manifestLoadError") {
                  hls.startLoad();
                } else {
                  setIsLoading(false);
                  setHasError(true);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setIsLoading(false);
                setHasError(true);
                setErrorMessage("Fatal playback error occurred");
                break;
            }
          }
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
        videoRef.current.muted = true; // Ensure the video is muted for autoplay
        
        videoRef.current.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          videoRef.current.play().catch(error => {
            console.error('Autoplay failed:', error);
          });
        });
        
        videoRef.current.addEventListener('error', (e) => {
          setIsLoading(false);
          setHasError(true);
          setErrorMessage("Error loading stream in Safari");
        });
      } else {
        setIsLoading(false);
        setHasError(true);
        setErrorMessage("HLS is not supported in this browser");
      }
    };

    initializePlayer();

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [hlsUrl, streamerUid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    const drawDetections = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      detections.forEach(detection => {
        const [x1, y1, x2, y2] = detection.box;
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.fillText(`${detection.class} (${(detection.confidence * 100).toFixed(1)}%)`, x1, y1 - 5);
      });
    };

    const captureFrame = async () => {
      if (video && video.readyState >= 2) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

        try {
          const response = await fetch('/api/detect-objects', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image_data: imageData.split(',')[1] }),
          });
          const data = await response.json();
          if (data.detections) {
            setDetections(data.detections);
            drawDetections();
          }
        } catch (error) {
          console.error('Error detecting objects:', error);
        }
      }
    };

    const interval = setInterval(captureFrame, 1000); // Capture frame every second

    return () => clearInterval(interval);
  }, [detections]);

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
          <div className="error-text">{errorMessage || "Error loading stream"}</div>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay // Ensure autoplay is enabled
        muted // Ensure muted is enabled for autoplay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  );
};

export default HlsPlayer;