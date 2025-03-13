import React, { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';

const HlsPlayer = ({ hlsUrl }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    let hls;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play();
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl;
      videoRef.current.play();
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [hlsUrl]);

  return (
    <div className="hls-player-container">
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

const HLSTester = () => {
  const [inputUrl, setInputUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');

  const handlePlay = () => {
    if (inputUrl.trim()) {
      setCurrentUrl(inputUrl);
    } else {
      alert('Please enter a valid HLS URL.');
    }
  };

  return (
    <div className="hls-tester">
      <div className="input-group">
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Enter HLS URL (m3u8)"
        />
        <button onClick={handlePlay}>
          Play Stream
        </button>
      </div>
      
      {currentUrl && (
        <div className="player-wrapper">
          <HlsPlayer hlsUrl={currentUrl} />
        </div>
      )}

      <style jsx>{`
        .hls-tester {
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }

        .input-group {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        input {
          flex: 1;
          padding: 12px;
          background: #2d2d2d;
          border: 1px solid #3d3d3d;
          border-radius: 8px;
          color: white;
          font-size: 14px;
        }

        button {
          padding: 12px 24px;
          background: #007bff;
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: background 0.3s ease;
        }

        button:hover {
          background: #0056b3;
        }

        .player-wrapper {
          position: relative;
          width: 100%;
          height: 0;
          padding-bottom: 56.25%; /* 16:9 aspect ratio */
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .hls-player-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
};

export default HLSTester;