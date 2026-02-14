# Paris Engine Redirector (vxpscript)

A production-ready redirect link cloaker and manager with advanced bot detection, real-time analytics, and multi-layer fraud prevention.

## Features

- **Link Cloaking & Redirect Management** — Create cloaked redirect links with encrypted payloads and multi-layer bot detection.
- **URL Rotation** — Weighted A/B split testing across multiple destination URLs per link.
- **Short Links** — Branded short URLs with custom aliases and click tracking.
- **Bot Detection** — Multi-layer detection using user-agent analysis, HTTP header inspection, client-side JavaScript signals, and canvas fingerprinting.
- **Fraud Analysis** — GeoIP-based country blocking, datacenter ASN detection, and client signal mismatch analysis.
- **Custom HTML Templates** — Upload and manage custom HTML interstitial pages with template tokens and built-in sanitization.
- **Real-Time Dashboard** — WebSocket-powered live click feed with per-user targeting.
- **Advanced Analytics** — Hourly breakdowns, geographic summaries, top-performing links, click rate summaries, and CSV export.
- **Custom Domains** — Register and use your own domains for redirect links.
- **Link Pause/Resume** — Temporarily disable links without deleting them.
- **Graceful Shutdown** — Clean server shutdown with connection draining.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `10000`) |
| `NODE_ENV` | No | Environment (`development` / `production`) |
| `JWT_SECRET` | **Yes (prod)** | Secret for JWT token signing |
| `REDIRECTOR_SECRET` | **Yes (prod)** | Secret for link payload encryption |
| `REDIRECT_SECRET` | No | Secret for Google Ads redirect HMAC signatures |
| `REDIS_URL` | No | Redis connection URL (falls back to in-memory cache) |
| `LOG_LEVEL` | No | Logging level: `debug`, `info`, `warn`, `error` |
| `RENDER_DISK_MOUNT_PATH` | No | Persistent disk path for production database |

## API Reference

### Authentication
- `POST /api/auth/access` — Authenticate with access key
- `POST /api/auth/admin-email` — Admin email login
- `POST /api/setup/claim` — Initial admin setup
- `GET /api/setup/status` — Check setup status

### User Profile
- `GET /api/me` — Get current user profile and summary counts

### Links
- `GET /api/links` — List all links
- `POST /api/links` — Create a new cloaked link
- `DELETE /api/links/:id` — Delete a link
- `PATCH /api/links/:id` — Update link tags/notes
- `PATCH /api/links/:id/status` — Pause or resume a link
- `GET /api/links/:id/analytics` — Get detailed click data for a link
- `GET /api/links/search?q=term` — Search links
- `POST /api/links/bulk-delete` — Bulk delete links

### Analytics
- `GET /api/stats/dashboard` — Dashboard summary statistics
- `GET /api/stats/clicks-by-day?days=14` — Daily click breakdown
- `GET /api/stats/hourly?hours=24` — Hourly click breakdown
- `GET /api/stats/geo-summary` — Geographic click distribution
- `GET /api/stats/top-links?limit=10` — Top performing links
- `GET /api/stats/rate-summary` — Today / week / month click rates
- `GET /api/stats/export?days=30` — Export click data as JSON

### Short Links
- `POST /api/short-links` — Create a short link
- `GET /api/short-links` — List short links
- `GET /api/short-links/stats` — Short link statistics
- `GET /api/short-links/check/:slug` — Check slug availability
- `GET /api/short-links/:slug/analytics` — Short link analytics
- `PUT /api/short-links/:slug` — Update a short link
- `DELETE /api/short-links/:slug` — Delete a short link

### Domains
- `GET /api/domains` — List custom domains
- `POST /api/domains` — Add a custom domain
- `DELETE /api/domains/:id` — Remove a custom domain

### Templates
- `GET /api/templates` — List templates
- `POST /api/templates` — Create/update a template
- `GET /api/templates/:name` — Get a template
- `PUT /api/templates/:name/default` — Set default template
- `DELETE /api/templates/:name` — Delete a template
- `POST /api/templates/validate` — Validate template HTML
- `POST /api/templates/preview` — Preview processed template
- `GET /api/templates/tokens` — List supported template tokens

### Admin
- `POST /api/admin/generate-key` — Generate an access key for a user (admin only)

### Health
- `GET /health` — Server health check with uptime

## Architecture

```
src/
├── server.js                    # Main Express server & route definitions
├── config.js                    # Centralized configuration
├── oauth.js                     # JWT sign/verify helpers
├── realtime.js                  # WebSocket server initialization
├── api/
│   └── routes.js                # Modular API router
├── lib/
│   ├── auth.js                  # Access key authentication logic
│   ├── botDetector.js           # Multi-layer bot detection engine
│   ├── cache.js                 # Redis / in-memory cache abstraction
│   ├── cloaker.js               # AES-256-GCM payload encryption
│   ├── database.js              # SQLite database with auto-migrations
│   ├── fraud.js                 # Advanced fraud analysis
│   ├── googleAdsRedirector.js   # HMAC-signed redirect URL generator
│   ├── htmlTemplateProcessor.js # Template sanitization & processing
│   ├── license.js               # License key management
│   ├── linkStore.js             # Link CRUD & analytics queries
│   ├── logger.js                # Structured logging utility
│   ├── shortLinkManager.js      # Short link management
│   └── templateStore.js         # Template persistence
├── middleware/
│   └── context.middleware.js    # Request context (user, IP, trace ID)
└── validators/
    ├── index.js                 # Validation error handler
    ├── auth.validator.js        # Auth input validation
    ├── domains.validator.js     # Domain input validation
    └── links.validator.js       # Link input validation
```

## License

MIT
