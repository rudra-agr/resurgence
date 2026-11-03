// SECURITY: security headers for every route. Production mode only: `npm run build && npm start`.
const isProd = process.env.NODE_ENV === 'production';

// PayPal's SDK and ag-grid need the sources below. Do not widen to "*". If the PayPal button
// stops rendering, add only the specific PayPal hosts the browser console reports.
const csp = [
  "default-src 'self'",
  // 'unsafe-eval' is needed by Next.js hot reload in development only.
  `script-src 'self' 'unsafe-inline' https://*.paypal.com https://*.paypalobjects.com${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: https://*.paypal.com https://*.paypalobjects.com",
  "connect-src 'self' https://*.paypal.com https://*.paypalobjects.com",
  'frame-src https://*.paypal.com',
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' }, // stops the donation page being framed (clickjacking)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
