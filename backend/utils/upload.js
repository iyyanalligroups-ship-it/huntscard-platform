const rateLimit = require('express-rate-limit');

// File extension for a stored upload, taken from the MIME type the fileFilter already accepted --
// never from the client-supplied filename. Otherwise an "image/png" part named evil.html is saved
// as .html and served back by the static /uploads mount as a web page.
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
};

function safeExt(file, fallback = '.jpg') {
  // 3D models are gated on extension (browsers report no useful MIME type for them).
  const ext = require('path').extname(file.originalname || '').toLowerCase();
  if (ext === '.glb' || ext === '.fbx') return ext;
  return EXT_BY_MIME[file.mimetype] || fallback;
}

// Forces a request value to a plain string so { "$ne": null } style objects can't reach a query.
function str(value) {
  return typeof value === 'string' ? value : '';
}

// Generic limiter for unauthenticated or message-sending endpoints.
function limiter(max, windowMinutes = 15, message = 'Too many requests. Please try again later.') {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

module.exports = { safeExt, str, limiter };
