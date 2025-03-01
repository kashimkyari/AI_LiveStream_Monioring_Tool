import React, { useState, useEffect } from 'react';

const VideoPlayer = ({ room_url, streamer_username, thumbnail = false, alerts = [] }) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [visibleAlerts, setVisibleAlerts] = useState([]);
  const [timestamp, setTimestamp] = useState(Date.now());

  const embedUrl = `https://cbxyz.com/in/?tour=SHBY&campaign=GoTLr&track=embed&room=${streamer_username}`;

  useEffect(() => {
    let interval;
    if (thumbnail) {
      interval = setInterval(() => {
        setTimestamp(Date.now());
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [thumbnail]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisibleAlerts(alerts);
    }, 300);
    return () => clearTimeout(timeout);
  }, [alerts]);

  return (
    <div className="video-container">
      {thumbnail ? (
        <div className="thumbnail-wrapper">
          <img
            src={`https://jpeg.live.mmcdn.com/stream?room=${streamer_username}&f=0.8399472484345041&t=${timestamp}`}
            alt="Stream thumbnail"
            onError={() => setThumbnailError(true)}
            className="thumbnail-image"
          />
          {thumbnailError && (
            <div className="thumbnail-fallback">
              <span>Room is offline</span>
            </div>
          )}
        </div>
      ) : (
        <div className="embedded-player-container">
          <iframe
            src={embedUrl}
            className="embedded-player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
            key={embedUrl}
          />
        </div>
      )}

      <div className="detection-overlay">
        {visibleAlerts.map((detection, index) => (
          <div 
            key={`${detection.class}-${index}`}
            className={`alert-marker ${detection.class.includes('CHAT') ? 'chat-alert' : ''}`}
            style={{
              left: `${detection.box[0]}%`,
              top: `${detection.box[1]}%`,
              width: `${detection.box[2] - detection.box[0]}%`,
              height: `${detection.box[3] - detection.box[1]}%`
            }}
          >
            <div className={`alert-label ${detection.class.includes('CHAT') ? 'chat-label' : ''}`}>
              {detection.class.includes('CHAT') 
                ? `⚠️ ${detection.class.replace('CHAT: ', '')}`
                : `${detection.class} (${(detection.confidence * 100).toFixed(1)}%)`}
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
          border: 2px solid #ff4444aa;
          background: #ff444422;
          transition: all 0.3s ease;
          transform: translateZ(0);
        }

        .alert-marker.chat-alert {
          border-color: #44ff44aa;
          background: #44ff4422;
          border-radius: 4px;
          width: 20% !important;
          height: 5% !important;
          left: 80% !important;
          top: 90% !important;
        }

        .alert-label {
          position: absolute;
          bottom: 100%;
          left: 0;
          background: #ff4444dd;
          color: white;
          padding: 4px 8px;
          font-size: 0.8em;
          border-radius: 4px;
          white-space: nowrap;
          backdrop-filter: blur(2px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .alert-label.chat-label {
          background: #44ff44dd;
          bottom: auto;
          top: -5px;
          left: 50%;
          transform: translateX(-50%);
          font-weight: bold;
        }

        .alert-label::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 8px;
          border-width: 5px;
          border-style: solid;
          border-color: #ff4444dd transparent transparent transparent;
        }

        .alert-label.chat-label::after {
          border-color: #44ff44dd transparent transparent transparent;
          top: auto;
          bottom: -10px;
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

          .alert-marker.chat-alert {
            width: 30% !important;
            left: 70% !important;
          }
        }
      `}</style>
    </div>
  );
};

export default VideoPlayer;