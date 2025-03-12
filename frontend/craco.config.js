const path = require('path');

module.exports = {
  // Extend Babel configuration to support class properties syntax
  babel: {
    plugins: [
      '@babel/plugin-proposal-class-properties' // Enables static & instance class properties
    ]
  },
  webpack: {
    configure: (webpackConfig) => {
      // Locate the oneOf rule array used by CRA for Babel processing
      const oneOfRule = webpackConfig.module.rules.find(rule => Array.isArray(rule.oneOf));
      if (oneOfRule) {
        oneOfRule.oneOf.forEach(rule => {
          // Check for babel-loader and ensure the loader has an 'include' field
          if (rule.loader && rule.loader.includes('babel-loader') && rule.include) {
            // Include the hls-video-element package so it is transpiled by Babel
            if (Array.isArray(rule.include)) {
              rule.include.push(path.resolve(__dirname, 'node_modules/hls-video-element'));
            } else {
              rule.include = [rule.include, path.resolve(__dirname, 'node_modules/hls-video-element')];
            }
          }
        });
      }
      return webpackConfig;
    }
  }
};
