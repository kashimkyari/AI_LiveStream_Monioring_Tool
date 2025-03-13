import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';

const HlsPlayer = ({ hlsUrl }) => {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let hls;

    const initializePlayer = () => {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          videoRef.current.play();
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS Error:', data);
          setError('Failed to load the stream. Please try again.');
          setIsLoading(false);
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
        videoRef.current.play();
        setIsLoading(false);
      } else {
        setError('HLS is not supported in this browser.');
        setIsLoading(false);
      }
    };

    initializePlayer();

    // Cleanup function
    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [hlsUrl]);

  // Handle modal resize
  useEffect(() => {
    const handleResize = () => {
      if (videoRef.current) {
        videoRef.current.style.width = '100%';
        videoRef.current.style.height = '100%';
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="hls-player-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>Loading stream...</p>
        </div>
      )}

      {error && (
        <div className="error-overlay">
          <p>{error}</p>
        </div>
      )}

      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%' }}
      />

      <style jsx>{`
        .hls-player-container {
          position: relative;
          width: 100%;
          height: 0;
          padding-bottom: 56.25%; /* 16:9 aspect ratio */
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        video {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .loading-overlay,
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
          z-index: 10;
        }

        .loading-spinner {
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top: 4px solid #007bff;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-overlay p {
          color: #ff4444;
          font-size: 1.2em;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default HlsPlayer;