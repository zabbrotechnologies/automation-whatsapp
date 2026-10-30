const app = require('../server');

module.exports = (req, res) => {
  // On Vercel, rewrites to /api/index.js change req.url to /api/index.js
  // Vercel preserves the user's actual requested path in x-vercel-original-path or x-matched-path
  const original = req.headers['x-vercel-original-path'] || 
                   req.headers['x-matched-path'] || 
                   req.headers['x-forwarded-uri'] || 
                   req.headers['x-vercel-rewrite-path'];

  if (original && (req.url === '/api/index.js' || req.url === '/api' || !req.url.startsWith('/api/'))) {
    req.url = original;
  }

  return app(req, res);
};
