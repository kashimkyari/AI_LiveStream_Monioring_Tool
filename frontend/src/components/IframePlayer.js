// IframePlayer.js
import React from 'react';

const IframePlayer = ({ streamerUsername }) => {
  const iframeUrl = `https://chaturbate.com/in/?room=${streamerUsername}&autoplay=1`;

  return (
    <iframe
      src={iframeUrl}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      style={{ 
        width: '100%',
        height: '100%',
        border: 'none',
        backgroundColor: '#000'
      }}
    />
  );
};

export default IframePlayer;