import React, { useState, useEffect, useRef } from 'react';
import videojs from './ video.js';
import './video-js.css';

const StripchatVideoPlayer = ({ streamerUid }) => {
  // Reference for the video DOM element and the video.js player instance.
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  
  // State to hold the stream URL fetched from the backend.
  const [edgeServerUrl, setEdgeServerUrl] = useState('');

  // Fetch the m3u8 URL (edge_server_url) from the backend using the provided streamerUid.
  useEffect(() => {
    if (!streamerUid) return;
    
    const fetchStreamUrl = async () => {
      try {
        const response = await fetch('/api/livestream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ streamerUid })
        });
        const data = await response.json();
        if (data.edge_server_url) {
          setEdgeServerUrl(data.edge_server_url);
        } else {
          console.error('No edge_server_url returned from backend');
        }
      } catch (error) {
        console.error('Error fetching stream URL:', error);
      }
    };

    fetchStreamUrl();
  }, [streamerUid]);

  // Initialize the Video.js player when the stream URL is available.
  useEffect(() => {
    if (!edgeServerUrl) return;

    // Initialize the video.js player with HLS source.
    playerRef.current = videojs(videoRef.current, {
      controls: true,
      autoplay: true,
      preload: 'auto',
      sources: [{
        src: edgeServerUrl,
        type: 'application/x-mpegURL'
      }]
    });

    // Autoplay may be restricted by some browsers so we call play() explicitly.
    playerRef.current.ready(() => {
      playerRef.current.play().catch(err => {
        console.error('Autoplay failed:', err);
      });
    });

    // Cleanup the player instance when the component unmounts or when edgeServerUrl changes.
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [edgeServerUrl]);

  return (
    <div>
      {/* Video element required by Video.js */}
      <video
        ref={videoRef}
        className="video-js vjs-default-skin"
        width="640"
        height="268"
        controls
        playsInline
      />
    </div>
  );
};

export default StripchatVideoPlayer;
