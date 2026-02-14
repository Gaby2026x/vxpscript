require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const chalk = require('chalk');
const helmet = require('helmet');
const requestIp = require('request-ip');
const userAgent = require('useragent');
const geoip = require('geoip-lite');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ==================== CRITICAL MODULE LOADING ====================
const linkStore = require('./lib/linkStore');
const botDetector = require('./lib/botDetector'); 
const getDb = require('./lib/database');
const shortLinkManager = require('./lib/shortLinkManager');
const templateStore = require('./lib/templateStore');
const { processTemplate, validateTemplate, getDefaultTemplate, SUPPORTED_TOKENS } = require('./lib/htmlTemplateProcessor');
const cloaker = require('./lib/cloaker');
const config = require('./config');
const auth = require('./lib/auth');

console.log(chalk.green('[SYSTEM] All local modules loaded successfully. '));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const JWT_SECRET = config.jwt.secret;
const UNLOCK_COOKIE_NAME = 'tr_unlocked';
const UNLOCK_TTL_SECONDS = 120;

// Middleware
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow inline scripts in templates
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' })); 
app.use(requestIp.mw());
app.use(express.static(path.join(__dirname, '../public'))); 

// ==================== COOKIE PARSER ====================
function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    return header.split(';').reduce((acc, part) => {
        const index = part.indexOf('=');
        if (index === -1) return acc;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        acc[key] = decodeURIComponent(value);
    }, {});
}

function buildUnlockCookie(token, req) {
    const parts = [
        `${UNLOCK_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/tr',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${UNLOCK_TTL_SECONDS}`
    ];

    const proto = req.headers['x-forwarded-proto'];
    const isSecure = req.secure || proto === 'https';
    if (isSecure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function clearUnlockCookie(req) {
    const parts = [
        `${UNLOCK_COOKIE_NAME}=`,
        'Path=/tr',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
    ];

    const proto = req.headers['x-forwarded-proto'];
    const isSecure = req.secure || proto === 'https';
    if (isSecure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

// ==================== AUTHENTICATION HELPER ====================
async function ensureDefaultUser() {
    try {
        const db = await getDb();
        const existing = await db.get('SELECT * FROM users WHERE username = ?', [config.adminEmail]);
        if (!existing) {
            console.log(chalk.yellow('[AUTH] Creating default admin user...'));
            const result = await auth.generateAccessKey(config.adminEmail, config.adminEmail);
            console.log(chalk.green('[AUTH] Default admin user created.'));
            console.log(chalk.cyan(`[AUTH] Admin Access Key: ${result.accessKey}`));
            console.log(chalk.cyan(`[AUTH] Key expires: ${result.expiresAt}`));
        }
    } catch (error) {
        console.error(chalk.red('[AUTH] Failed to ensure default user: '), error.message);
    }
}
ensureDefaultUser();

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Optional auth - attaches user if token present but doesn't require it
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) {
                req.user = user;
            }
            next();
        });
    } else {
        next();
    }
};

// ==================== WEBSOCKET SERVER ====================
const clients = new Map();
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    clients.set(ws, { id: clientId, ip, userId: null });
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'AUTH' && data.token) {
                try {
                    const decoded = jwt.verify(data.token, JWT_SECRET);
                    const client = clients.get(ws);
                    if (client) { client.userId = decoded.id; }
                } catch (e) { }
            }
        } catch (e) { }
    });
    ws.on('close', () => { clients.delete(ws); });
});

function broadcastToUser(userId, type, payload) {
    const message = JSON.stringify({ type, payload });
    clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN && client.userId === userId) {
            ws.send(message);
        }
    });
}

// ==================== HELPER:  GET USER TEMPLATE OR DEFAULT ====================
async function getRedirectTemplate(ownerId) {
    try {
        if (ownerId) {
            const userTemplate = await templateStore.getDefault(ownerId);
            if (userTemplate && userTemplate.htmlContent) {
                return userTemplate.htmlContent;
            }
        }
    } catch (e) {
        console.log(chalk.yellow('[TEMPLATE] Error fetching user template, using default'));
    }
    return getDefaultTemplate();
}

// ==================== HELPER: GET PREFERRED DOMAIN ====================
async function getUserPreferredDomain(ownerId, reqHost) {
    try {
        const db = await getDb();
        const customDomain = await db.get('SELECT hostname FROM custom_domains WHERE ownerId = ? ORDER BY id DESC LIMIT 1', [ownerId]);
        
        if (customDomain && customDomain.hostname) {
            if (!customDomain.hostname.startsWith('http')) {
                return `https://${customDomain.hostname}`;
            }
            return customDomain.hostname;
        }
    } catch (e) {
        console.error('Error fetching custom domain:', e);
    }
    const protocol = reqHost.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${reqHost}`;
}

// ==================== UNLOCK ROUTE (POST) ====================
app.post('/tr/v2/unlock', async (req, res) => {
    try {
        const payloadString = req.body.payload;
        const linkId = req.body.lid;
        // Collect signals sent from client for deeper verification
        const clientSignals = req.body.signals ? JSON.parse(req.body.signals) : {};

        if (!payloadString) {
            console.log(chalk.red('[UNLOCK] No payload received'));
            return res.redirect('https://google.com');
        }

        // 1. Decrypt the URL server-side
        let encryptedData;
        try {
            encryptedData = JSON.parse(payloadString);
        } catch (parseErr) {
            console.log(chalk.red('[UNLOCK] Failed to parse payload JSON'));
            return res.redirect('https://google.com');
        }
        
        const destinationUrl = cloaker.decryptPayload(encryptedData);

        if (!destinationUrl) {
            console.log(chalk.red('[UNLOCK] Decryption Failed - Potential Tampering'));
            return res.redirect('https://google.com');
        }

        // 2. Validate the destination URL is not our own tracking URL (prevent loops)
        if (destinationUrl.includes('/tr/v1/') || destinationUrl.includes('/tr/v2/')) {
            console.log(chalk.red('[UNLOCK] Loop detected - destination points back to tracking URL'));
            return res.redirect('https://google.com');
        }

        // 3. Double-Check Bot Detection (Server Side) - STRICT EDGE BLOCKING
        const botCheck = botDetector(req, clientSignals);
        
        if (botCheck.isBot) {
            console.log(chalk.yellow(`[UNLOCK] Server detected bot (Score: ${botCheck.score}) - BLOCKED -> Google`));
            return res.redirect('https://www.google.com');
        }

        console.log(chalk.green(`[UNLOCK] Success -> Redirecting to:  ${destinationUrl}`));

        // 3B. Set short-lived unlock cookie to prevent refresh loops
        const unlockToken = jwt.sign(
            { linkId, ts: Date.now() },
            JWT_SECRET,
            { expiresIn: `${UNLOCK_TTL_SECONDS}s` }
        );
        res.setHeader('Set-Cookie', buildUnlockCookie(unlockToken, req));
        
        // 4. Return JSON for smooth AJAX transition (White Page Fix) or Redirect fallback
        if (req.headers['accept'] === 'application/json') {
            return res.json({ url: destinationUrl });
        }

        // 5. Fallback for non-AJAX requests
        return res.redirect(302, destinationUrl);

    } catch (e) {
        console.error('[UNLOCK] Error:', e.message);
        res.redirect('https://google.com');
    }
});

// ==================== TRACKING ROUTE (GET) ====================
app.get('/tr/v1/:id', async (req, res) => {
    const linkId = req.params.id;
    const uaString = req.headers['user-agent'] || '';
    const ip = req.clientIp;
    const referer = req.headers['referer'] || req.headers['referrer'] || '';
    
    console.log(chalk.cyan(`[TRACKING] Incoming hit for ${linkId} from ${ip}`));

    try {
        // 1. Fetch Link
        const link = await linkStore.getLink(linkId);
        if (!link) {
            console.log(chalk.red(`[TRACKING] Link not found:  ${linkId}`));
            return res.status(404).send('Link not found or expired');
        }

        // 1b. Check if link is paused
        if (link.isActive === 0) {
            console.log(chalk.yellow(`[TRACKING] Link is paused: ${linkId}`));
            return res.status(410).send('This link is currently paused');
        }

        // 2. Initial Bot Detection (Server Side)
        const clientSignals = req.query.s ? { score: 0 } : {}; 
        const botResult = botDetector(req, clientSignals);
        const isBot = botResult.isBot;
        
        // 3. Geo Lookup
        const geo = geoip.lookup(ip);
        const country = geo ? geo.country : 'Unknown';
        
        // 4. Get the ACTUAL destination URL
        const destinationUrl = link.destinationUrlDesktop;
        
        if (!destinationUrl) {
            console.log(chalk.red(`[TRACKING] No destination URL for link:  ${linkId}`));
            return res.redirect('https://google.com');
        }

        // 5. Handle Response - IMMEDIATE BLOCK
        if (isBot) {
            console.log(chalk.yellow(`[TRACKING] Blocking Bot (${botResult.score}) -> Google`));
            return res.redirect('https://www.google.com');
        }

        // 6. If unlock token exists, redirect immediately (prevents refresh loops)
        const cookies = parseCookies(req);
        const unlockToken = cookies[UNLOCK_COOKIE_NAME];
        if (unlockToken) {
            try {
                const decoded = jwt.verify(unlockToken, JWT_SECRET);
                if (decoded && decoded.linkId === linkId) {
                    res.setHeader('Set-Cookie', clearUnlockCookie(req));
                    console.log(chalk.green('[TRACKING] Unlock cookie detected - redirecting without template'));
                    return res.redirect(302, destinationUrl);
                }
            } catch (e) {
                // invalid/expired cookie; proceed with template flow
            }
        }

        // 7. Log to Database
        await linkStore.logClick({
            linkId, isBot, ipAddress: ip, userAgent: uaString, country, referrer: referer, destinationUrl: destinationUrl
        });

        // 8. WebSocket Broadcast
        if (link.ownerId) {
            broadcastToUser(link.ownerId, 'LIVE_CLICK', {
                linkId, isBot, clickType: isBot ? 'bot' : 'human', country, timestamp: Date.now(), ipAddress: ip, score: botResult.score
            });
        }

        // 9. HUMAN DETECTED - Serve the cloaked page
        console.log(chalk.green(`[TRACKING] Human detected - Serving cloaked page`));
        
        // A. Get User's Template (sanitized, NO redirect injection from processor)
        const rawTemplate = await getRedirectTemplate(link.ownerId);
        
        // B. Process template - CRITICAL: injectRedirect = false
        // The HTML processor will now DE-OBFUSCATE and NEUTRALIZE redirects in the template
        // so it displays instantly without hanging the browser.
        const { html: processedHtml } = processTemplate(rawTemplate, {
            destinationUrl: '#', // Don't expose real URL in template tokens
            linkId: linkId,
            country: country,
            domain: req.get('host'),
            injectRedirect: false // CRITICAL: Disable processor's redirect to use our secure unlock
        });

        // C. Generate Encrypted Payload for the REAL destination
        const encrypted = cloaker.encryptPayload(destinationUrl);
        const payloadSafe = JSON.stringify(encrypted)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'");

        // D. Create the Unlock Script - OPTIMIZED FOR SMOOTH TRANSITION (NO WHITE PAGE)
        // Uses AJAX (fetch) to submit credentials and waits for JSON response before redirecting.
        const unlockScript = `
<script data-system-unlock="true">
(function() {
    'use strict';
    
    var P = JSON.parse("${payloadSafe}");
    var LID = "${linkId}";
    var hasSubmitted = false;
    
    // Client-Side Bot Detection (Fast Checks)
    function checkBot() {
        if (navigator.webdriver) return true;
        if (window.callPhantom || window._phantom) return true;
        if (navigator.userAgent.indexOf('HeadlessChrome') !== -1) return true;
        return false;
    }

    // Capture basic signals to send back to server for verification
    function getSignals() {
        return JSON.stringify({
            webdriver: !!navigator.webdriver,
            headless: navigator.userAgent.indexOf('HeadlessChrome') !== -1,
            jsExecuted: true
        });
    }

    function submitUnlock() {
        if (hasSubmitted) return;
        
        if (checkBot()) {
            window.location.replace("https://www.google.com");
            return;
        }

        hasSubmitted = true;
        
        // USE AJAX (FETCH) INSTEAD OF FORM SUBMIT
        // This prevents the page from unloading (turning white) while waiting for the server
        fetch('/tr/v2/unlock', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json' // Explicitly request JSON
            },
            body: JSON.stringify({
                payload: JSON.stringify(P),
                lid: LID,
                signals: getSignals()
            })
        })
        .then(function(response) {
            // Handle if server did a hard redirect anyway
            if (response.redirected) {
                // Try to use secure backdoor first
                if (window.__sys_ops && window.__sys_ops.replace) {
                    window.__sys_ops.replace(response.url);
                } else {
                    window.location.href = response.url;
                }
                return null;
            }
            return response.json();
        })
        .then(function(data) {
            if (data && data.url) {
                // Use the backdoor provided by htmlTemplateProcessor to bypass the freezer
                if (window.__sys_ops && window.__sys_ops.replace) {
                    window.__sys_ops.replace(data.url);
                } else {
                    // Fallback (might be blocked by nuclear freezer if backdoor is missing)
                    window.location.replace(data.url);
                }
            }
        })
        .catch(function(err) {
            console.error("Unlock failed", err);
            // Last resort fallback
            window.location.replace("https://google.com");
        });
    }

    // Capture captcha-verified event from our interactive script
    document.addEventListener('captcha-verified', function() {
        submitUnlock(); // Immediate submission
    });

    // Auto-submit immediately if it's a non-interactive template (e.g. just a loading bar)
    // The "system-captcha-wrapper" class comes from the htmlTemplateProcessor
    if (document.querySelector('.system-captcha-wrapper') === null) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            submitUnlock();
        } else {
            document.addEventListener('DOMContentLoaded', submitUnlock);
        }
    }
})();
</script>`;

        // E. Inject the unlock script at the end of body
        let finalHtml = processedHtml;
        if (finalHtml.toLowerCase().includes('</body>')) {
            finalHtml = finalHtml.replace(/<\/body>/i, `${unlockScript}\n</body>`);
        } else {
            finalHtml += unlockScript;
        }

        // F. Send response with no-cache headers
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        return res.send(finalHtml);

    } catch (error) {
        console.error(chalk.red('[TRACKING] FATAL ERROR:  '), error);
        res.status(500).send('Internal Server Error');
    }
});

// ==================== SHORT LINK REDIRECT ROUTE ====================
// ENHANCEMENT: Added bot detection to protect custom domains from bots accessing short links.
// Bots are redirected to Google, humans proceed to the destination.
app.get('/s/:slug', async (req, res) => {
    const { slug } = req.params;
    
    console.log(chalk.cyan(`[SHORT-LINK] Resolving:  /${slug}`));

    try {
        const link = await shortLinkManager.resolve(slug);
        
        if (!link) {
            console.log(chalk.red(`[SHORT-LINK] Not found: /${slug}`));
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Link Not Found</title></head>
                <body style="font-family: sans-serif;display: flex;justify-content: center;align-items: center;height:100vh;background:#1a1a2e;color:#fff;">
                    <div style="text-align:center;">
                        <h1>404</h1>
                        <p>This short link does not exist or has expired.</p>
                    </div>
                </body>
                </html>
            `);
        }

        // ENHANCEMENT: Bot Detection for Short Links
        // Protects custom domains by blocking bots from accessing the destination URL.
        const clientSignals = {}; // No client signals for direct redirects
        const botCheck = botDetector(req, clientSignals);
        
        if (botCheck.isBot) {
            console.log(chalk.yellow(`[SHORT-LINK] Blocking Bot (${botCheck.score}) for /${slug} -> Google`));
            return res.redirect('https://www.google.com');
        }

        // HUMAN DETECTED - Proceed with redirect
        console.log(chalk.green(`[SHORT-LINK] Human detected for /${slug} -> Redirecting`));

        const ip = req.clientIp || req.ip;
        const geo = geoip.lookup(ip ? ip.replace('::ffff:', '') : '');
        const country = geo?.country || 'Unknown';
        
        shortLinkManager.recordClick(slug, {
            ipAddress: ip,
            userAgent: req.headers['user-agent'] || '',
            referrer: req.headers['referer'] || req.headers['referrer'] || '',
            country: country
        }).catch(err => console.error('[SHORT-LINK] Click record error:', err));

        console.log(chalk.green(`[SHORT-LINK] Redirecting /${slug} -> ${link.targetUrl}`));
        
        // Using same updated processor logic for consistency
        const rawTemplate = await getRedirectTemplate(link.ownerId);
        const { html: finalHtml } = processTemplate(rawTemplate, {
            destinationUrl: link.targetUrl,
            linkId: `short-${link.id}`,
            country: country,
            domain: req.get('host'),
            injectRedirect: true 
        });

        res.setHeader('Content-Type', 'text/html');
        return res.send(finalHtml);

    } catch (error) {
        console.error(chalk.red(`[SHORT-LINK] Error:  ${error.message}`));
        res.status(500).send('Internal Server Error');
    }
});

// ==================== API ROUTES ====================
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });

// --- Initial Setup Endpoints (for first-time admin key retrieval) ---
app.get('/api/setup/status', authLimiter, async (req, res) => {
    try {
        const db = await getDb();
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        // Setup is needed if there are 0 or 1 users (the auto-created admin who has never logged in)
        const adminUser = await db.get('SELECT id FROM users WHERE username = ? AND role = ?', [config.adminEmail, 'admin']);
        res.json({ setupRequired: userCount.count <= 1 && !!adminUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/setup/claim', authLimiter, async (req, res) => {
    try {
        const { adminEmail } = req.body;
        if (!adminEmail || adminEmail.trim().toLowerCase() !== config.adminEmail.toLowerCase()) {
            return res.status(403).json({ error: 'The email address does not match the configured admin email.' });
        }
        const db = await getDb();
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        const adminUser = await db.get('SELECT id FROM users WHERE username = ? AND role = ?', [config.adminEmail, 'admin']);
        // Only allow claim when setup is still applicable (1 or fewer users, admin exists)
        if (userCount.count > 1 || !adminUser) {
            return res.status(403).json({ error: 'Initial setup has already been completed. Use your existing access key or contact the admin.' });
        }
        // Generate a fresh access key for the admin
        const result = await auth.generateAccessKey(config.adminEmail, config.adminEmail);
        console.log(chalk.green('[SETUP] Admin access key claimed via setup page.'));
        res.json({ accessKey: result.accessKey, expiresAt: result.expiresAt });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/access', authLimiter, async (req, res) => {
    const { accessKey } = req.body;
    try {
        const user = await auth.validateAccessKey(accessKey);
        if (!user) return res.status(401).json({ error: 'Invalid or expired access key.' });
        const token = auth.sign({ id: user.id, user: user.email, role: user.role });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin email login — allows admin to log in directly with their hardcoded email
app.post('/api/auth/admin-email', authLimiter, async (req, res) => {
    const { email } = req.body;
    try {
        if (!email || email.trim().toLowerCase() !== config.adminEmail.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid admin email address.' });
        }
        const db = await getDb();
        // Ensure the admin user exists in the database
        let adminUser = await db.get('SELECT id, username, role FROM users WHERE username = ? AND role = ?', [config.adminEmail, 'admin']);
        if (!adminUser) {
            // Create admin user if not yet created (side effect: generates access key)
            await auth.generateAccessKey(config.adminEmail, config.adminEmail);
            adminUser = await db.get('SELECT id, username, role FROM users WHERE username = ?', [config.adminEmail]);
        }
        const token = auth.sign({ id: adminUser.id, user: adminUser.username, role: adminUser.role });
        res.json({ token, user: { id: adminUser.id, email: adminUser.username } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/generate-key', authLimiter, authenticateToken, async (req, res) => {
    const { targetEmail } = req.body;
    try {
        if (req.user.user !== config.adminEmail) {
            return res.status(403).json({ error: 'Forbidden: Only the admin can generate access keys.' });
        }
        const result = await auth.generateAccessKey(req.user.user, targetEmail);
        res.json({ accessKey: result.accessKey, expiresAt: result.expiresAt });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/links', authenticateToken, async (req, res) => {
    try {
        const links = await linkStore.getLinksForUser(req.user.id);
        res.json(links);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Search links (must be before :id routes)
app.get('/api/links/search', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length === 0) return res.json([]);
        const results = await linkStore.searchLinks(req.user.id, q.trim());
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk delete links (must be before :id routes)
app.post('/api/links/bulk-delete', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const { linkIds } = req.body;
        if (!Array.isArray(linkIds) || linkIds.length === 0) {
            return res.status(400).json({ error: 'linkIds must be a non-empty array' });
        }
        if (linkIds.length > 50) {
            return res.status(400).json({ error: 'Cannot delete more than 50 links at once' });
        }
        const deleted = await linkStore.bulkDeleteLinks(linkIds, req.user.id);
        res.json({ deleted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== FIXED: POST /api/links (WITH DOMAIN PRIORITIZATION) ====================
app.post('/api/links', authenticateToken, async (req, res) => {
    try {
        const { rotations, expiresAt, customDomain } = req.body;
        
        // 1. Determine the base domain to use
        let publicDomain = customDomain;
        
        // 2. Ensure it has a protocol if it's a custom domain
        if (publicDomain && publicDomain.trim() !== '') {
            publicDomain = publicDomain.trim();
            if (!publicDomain.startsWith('http://') && !publicDomain.startsWith('https://')) {
                publicDomain = `https://${publicDomain}`;
            }
        } else {
            // 3. Fallback to the server host if no custom domain selected
            const protocol = req.protocol === 'http' ? 'http' : 'https'; // Trust proxy handling
            publicDomain = `${protocol}://${req.get('host')}`;
        }

        console.log(chalk.blue(`[LINK-GEN] Generating link using: ${publicDomain}`));

        // 4. Create the link (Using the File Mimicry or Standard Redirector)
        const result = await linkStore.createLinkWithRotations({
            ownerId: req.user.id,
            publicDomain: publicDomain,
            expiresAt,
            rotations
        });
        
        res.json(result);
    } catch (err) { 
        console.error(chalk.red('[LINK-GEN] Error:'), err.message);
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/links/:id', authenticateToken, async (req, res) => {
    try {
        await linkStore.deleteLink(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update link tags and notes
app.patch('/api/links/:id', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const { tags, notes } = req.body;
        const updated = await linkStore.updateLinkMeta(req.params.id, req.user.id, { tags, notes });
        if (!updated) return res.status(404).json({ error: 'Link not found' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/links/:id/analytics', authenticateToken, async (req, res) => {
    try {
        const clicks = await linkStore.getDetailedClicksForLink(req.params.id, req.user.id);
        if (!clicks) return res.status(404).json({ error: 'Link not found' });
        res.json(clicks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats/clicks-by-day', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const stats = await linkStore.getClicksByDay(req.user.id, req.query.days || 14);
        res.json(stats);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dashboard summary stats
app.get('/api/stats/dashboard', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const stats = await linkStore.getDashboardStats(req.user.id);
        res.json(stats);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export clicks as JSON
app.get('/api/stats/export', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const { linkId, days } = req.query;
        const data = await linkStore.exportClicks(req.user.id, { 
            linkId, 
            days: parseInt(days) || 30 
        });
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== USER PROFILE ENDPOINT ====================
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const db = await getDb();
        const user = await db.get('SELECT id, username, role, createdAt FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const linkCount = await db.get('SELECT COUNT(*) as count FROM links WHERE ownerId = ?', [req.user.id]);
        const shortLinkCount = await db.get('SELECT COUNT(*) as count FROM short_links WHERE ownerId = ?', [req.user.id]);
        res.json({
            id: user.id,
            email: user.username,
            role: user.role,
            createdAt: user.createdAt,
            totalLinks: linkCount?.count || 0,
            totalShortLinks: shortLinkCount?.count || 0
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== ADVANCED ANALYTICS ENDPOINTS ====================
app.get('/api/stats/hourly', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const stats = await linkStore.getHourlyBreakdown(req.user.id, hours);
        res.json(stats);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats/geo-summary', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const geo = await linkStore.getGeoSummary(req.user.id);
        res.json(geo);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats/top-links', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const topLinks = await linkStore.getTopLinks(req.user.id, limit);
        res.json(topLinks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats/rate-summary', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const summary = await linkStore.getClickRateSummary(req.user.id);
        res.json(summary);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== LINK PAUSE / RESUME ====================
app.patch('/api/links/:id/status', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const { active } = req.body;
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: 'The "active" field must be a boolean' });
        }
        const db = await getDb();
        const link = await db.get('SELECT id FROM links WHERE id = ? AND ownerId = ?', [req.params.id, req.user.id]);
        if (!link) return res.status(404).json({ error: 'Link not found or permission denied' });
        await db.run('UPDATE links SET isActive = ? WHERE id = ?', [active ? 1 : 0, req.params.id]);
        res.json({ success: true, active });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/domains', authenticateToken, async (req, res) => {
    try {
        const db = await getDb();
        const domains = await db.all('SELECT * FROM custom_domains WHERE ownerId = ?', req.user.id);
        res.json(domains);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/domains', authenticateToken, async (req, res) => {
    try {
        const hostname = (req.body.hostname || '').trim().toLowerCase();
        if (!hostname || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname)) {
            return res.status(400).json({ error: 'Invalid hostname. Please enter a valid domain (e.g., mysite.com)' });
        }
        const db = await getDb();
        const result = await db.run('INSERT INTO custom_domains (ownerId, hostname) VALUES (?, ?)', [req.user.id, hostname]);
        res.json({ id: result.lastID, hostname });
    } catch(e) { res.status(400).json({ error: 'Domain already exists' }); }
});

app.delete('/api/domains/:id', authenticateToken, async (req, res) => {
    try {
        const db = await getDb();
        await db.run('DELETE FROM custom_domains WHERE id = ? AND ownerId = ?', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== SHORT LINK API ROUTES ====================
app.post('/api/short-links', authenticateToken, async (req, res) => {
    const { targetUrl, alias, title, expiresAt } = req.body;

    try {
        const result = await shortLinkManager.create({
            targetUrl,
            ownerId: req.user.id,
            alias: alias || null,
            title: title || null,
            expiresAt: expiresAt || null
        });

        const domainUrl = await getUserPreferredDomain(req.user.id, req.get('host'));
        result.fullShortUrl = `${domainUrl}/s/${result.slug}`;

        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/short-links', authenticateToken, async (req, res) => {
    try {
        const links = await shortLinkManager.getByOwner(req.user.id);
        
        const domainUrl = await getUserPreferredDomain(req.user.id, req.get('host'));
        
        const enrichedLinks = links.map(link => ({
            ...link,
            fullShortUrl: `${domainUrl}/s/${link.slug}`
        }));

        res.json(enrichedLinks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/short-links/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await shortLinkManager.getStats(req.user.id);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/short-links/check/:slug', authenticateToken, async (req, res) => {
    const { slug } = req.params;

    try {
        const available = await shortLinkManager.isSlugAvailable(slug);
        res.json({ slug, available });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/short-links/:slug/analytics', authenticateToken, async (req, res) => {
    const { slug } = req.params;

    try {
        const analytics = await shortLinkManager.getAnalytics(slug, req.user.id);
        
        if (!analytics) {
            return res.status(404).json({ error: 'Short link not found or access denied' });
        }

        res.json(analytics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/short-links/:slug', authenticateToken, async (req, res) => {
    const { slug } = req.params;
    const updates = req.body;

    try {
        const success = await shortLinkManager.update(slug, req.user.id, updates);
        
        if (!success) {
            return res.status(404).json({ error: 'Short link not found or access denied' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/short-links/:slug', authenticateToken, async (req, res) => {
    const { slug } = req.params;

    try {
        const success = await shortLinkManager.delete(slug, req.user.id);
        
        if (!success) {
            return res.status(404).json({ error: 'Short link not found or access denied' });
        }

        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TEMPLATE API ROUTES ====================
app.get('/api/templates', authenticateToken, async (req, res) => {
    try {
        const templates = await templateStore.getAll(req.user.id);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/templates/tokens', (req, res) => {
    res.json({
        tokens: Object.keys(SUPPORTED_TOKENS),
        descriptions: {
            '%%DESTINATION_URL%%': 'The final destination URL for redirect',
            '%%RAY_ID%%': 'Unique request identifier',
            '%%TIMESTAMP%%': 'Current Unix timestamp',
            '%%LINK_ID%%': 'The tracking link ID',
            '%%COUNTRY%%': 'Visitor country code',
            '%%DOMAIN%%': 'Current domain name',
            '%%REDIRECT_DELAY%%': 'Redirect delay in milliseconds'
        }
    });
});

app.get('/api/templates/default-system', (req, res) => {
    res.json({
        name: 'System Default',
        htmlContent: getDefaultTemplate()
    });
});

app.post('/api/templates', authenticateToken, async (req, res) => {
    const { name, description, htmlContent, isDefault } = req.body;

    if (!name || !htmlContent) {
        return res.status(400).json({ error: 'Name and HTML content are required' });
    }

    try {
        const result = await templateStore.save({
            ownerId: req.user.id,
            name,
            description,
            htmlContent,
            isDefault: isDefault || false
        });

        res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/templates/validate', (req, res) => {
    const { htmlContent } = req.body;

    if (!htmlContent) {
        return res.status(400).json({ error: 'HTML content is required' });
    }

    const validation = validateTemplate(htmlContent);
    res.json(validation);
});

app.post('/api/templates/preview', optionalAuth, (req, res) => {
    const { htmlContent, destinationUrl } = req.body;

    if (!htmlContent) {
        return res.status(400).json({ error: 'HTML content is required' });
    }

    try {
        const result = processTemplate(htmlContent, {
            destinationUrl: destinationUrl || 'https://example.com',
            linkId: 'preview-123',
            country: 'US',
            domain: req.get('host'),
            redirectDelay: 1500,
            injectRedirect: true
        });

        res.json({
            processedHtml: result.html,
            sanitizationReport: result.sanitizationReport
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/templates/:name', authenticateToken, async (req, res) => {
    const { name } = req.params;

    try {
        const template = await templateStore.get(req.user.id, name);
        
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/templates/:name/default', authenticateToken, async (req, res) => {
    const { name } = req.params;

    try {
        const success = await templateStore.setDefault(req.user.id, name);
        
        if (!success) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/templates/:name', authenticateToken, async (req, res) => {
    const { name } = req.params;

    try {
        const success = await templateStore.delete(req.user.id, name);
        
        if (!success) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() }));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '../public', 'index.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(chalk.green(`🚀 Server running on port ${PORT}`));
});

// ==================== GRACEFUL SHUTDOWN ====================
function gracefulShutdown(signal) {
    console.log(chalk.yellow(`\n[SHUTDOWN] ${signal} received. Closing server gracefully...`));
    server.close(async () => {
        console.log(chalk.yellow('[SHUTDOWN] HTTP server closed.'));
        try {
            const cache = require('./lib/cache');
            await cache.quit();
            console.log(chalk.yellow('[SHUTDOWN] Cache connections closed.'));
        } catch (e) { /* ignore */ }
        console.log(chalk.green('[SHUTDOWN] Shutdown complete.'));
        process.exit(0);
    });
    // Force shutdown after 10 seconds if graceful fails
    setTimeout(() => {
        console.error(chalk.red('[SHUTDOWN] Forced shutdown after timeout.'));
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
