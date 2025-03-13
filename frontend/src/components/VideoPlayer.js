import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import IframePlayer from './IframePlayer';

const HlsPlayer = ({ streamerUid }) => {
  const videoRef = useRef(null);
  const actualStreamerUid = streamerUid !== "${streamerUid}" ? streamerUid : "";
  const hlsUrl = actualStreamerUid ? `https://b-hls-11.doppiocdn.live/hls/${actualStreamerUid}/${actualStreamerUid}.m3u8` : "";
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
          if (data.details === "manifestLoadError") {
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
    </div>
  );
};

const VideoPlayer = ({
  platform = "stripchat", 
  streamerUid,
  streamerName,
  staticThumbnail,
}) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (platform.toLowerCase() === 'stripchat' && staticThumbnail) {
      setThumbnail(staticThumbnail);
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
        return <HlsPlayer streamerUid={streamerUid} />;
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