require('dotenv').config();

// Robust Fallback: Generate a random secret if missing in Dev, but warn heavily.
// In Production, we still want to ensure security.
const DEFAULT_SECRET = 'dev-secret-do-not-use-in-prod-' + Math.random();

if ((!process.env.JWT_SECRET || !process.env.REDIRECTOR_SECRET) && process.env.NODE_ENV === 'production') {
  console.error("FATAL ERROR: JWT_SECRET and REDIRECTOR_SECRET must be defined in .env file for production.");
  process.exit(1);
}

module.exports = {
  // Server configuration
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',

  // Admin email — only this email can generate access keys
  adminEmail: 'admin@proctektexas.org',
  
  // JWT Authentication
  jwt: {
    secret: process.env.JWT_SECRET || DEFAULT_SECRET,
    expiresIn: '24h' // Increased to match app.js session expectations
  },
  
  // Redis Cache Configuration (Optional)
  redis: {
    enabled: !!process.env.REDIS_URL,
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // Redirector / Cloaker Configuration
  redirector: {
    secret: process.env.REDIRECTOR_SECRET || DEFAULT_SECRET,
    // How long the encrypted payload remains valid (in ms)
    tokenTtl: 2 * 60 * 1000, // 2 minutes
    // Default fallback if bot is detected
    fallbackUrl: 'https://www.google.com'
  },
  
  // Advanced Fraud detection settings
  fraud: {
    // Risk score thresholds.
    thresholds: {
      high: 80,   // Score >= 80 is high risk (Block)
      medium: 50  // Score >= 50 is medium risk (Challenge/Log)
    },
    // List of allowed country codes. An empty array allows all countries.
    allowedCountries: [], 
    // Expanded list of ASNs known to be data centers / cloud providers
    // This helps the fraud.js engine block scanners immediately.
    datacenterAsn: [
      15169, // Google
      16509, // Amazon AWS
      8075,  // Microsoft Azure
      14061, // DigitalOcean
      24940, // Hetzner
      16276, // OVH
      63949, // Linode / Akamai
      20473, // Choopa / Vultr
      13335, // Cloudflare
      393406 // DigitalOcean
    ]
  },

  // Link configuration
  link: {
    // Default expiration time (7 days)
    expiresIn: 7 * 24 * 60 * 60 * 1000,
    // Default cache expiration for a link in seconds
    cacheTTL: 60 * 60 // 1 hour
  },

  // License configuration
  license: {
    plans: {
      free: { limit: 100, name: 'Free' },
      pro: { limit: 1000, name: 'Pro' },
      enterprise: { limit: Infinity, name: 'Enterprise' }
    },
    resetInterval: 60 * 60 * 1000 // 1 hour
  }
};
