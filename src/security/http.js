/* HTTP hardening: security headers and a small in-memory rate limiter (no dependencies). */

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self' https://checkout.razorpay.com", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://*.razorpay.com",
    "font-src 'self'", "connect-src 'self' https://*.razorpay.com", "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com", "worker-src 'self' blob:", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
  ].join('; '));
  if (req.secure || process.env.COOKIE_SECURE === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

const buckets = new Map();
/** rateLimit('login', 10, 15*60e3) -> at most 10 requests per IP per 15 minutes on that route group. */
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, reset: now + windowMs };
    if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
    b.n++;
    buckets.set(key, b);
    if (b.n > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60e3).unref();

module.exports = { securityHeaders, rateLimit };
