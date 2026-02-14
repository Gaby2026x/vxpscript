const express = require('express');
const rateLimit = require('express-rate-limit');
const geoip = require('fast-geoip');
const chalk = require('chalk');

const { validate } = require('../validators');
const { accessKeyValidationRules, generateKeyValidationRules } = require('../validators/auth.validator');
const { createLinkValidationRules } = require('../validators/links.validator');
const { createDomainValidationRules } = require('../validators/domains.validator');

const getDb = require('../lib/database');
const auth = require('../lib/auth');
const config = require('../config');
const license = require('../lib/license');
const linkStore = require('../lib/linkStore');
const cloaker = require('../lib/cloaker');
const googleAdsRedirector = require('../lib/googleAdsRedirector');
const detectBot = require('../lib/bot-detector');

const router = express.Router();

// Rate limiters with proper configuration for proxied environments
const authLimiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 20, 
    standardHeaders: true, 
    legacyHeaders: false,
    // Skip validation since we set trust proxy in server.js
    validate: { xForwardedForHeader: false }
});

const apiLimiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 300, 
    standardHeaders: true, 
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

/**
 * =====================================================
 * HEALTH CHECK
 * =====================================================
 */
router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * =====================================================
 * PRIMARY REDIRECT HANDLER - Entry Point for Clicks
 * =====================================================
 */
router.get('/tr/v1/:id', async (req, res) => {
    const { id } = req.params;
    const startTime = Date.now();
    
    console.log(chalk.yellow.bold(`\n${'='.repeat(70)}`));
    console.log(chalk.yellow.bold(`[CLICK] 🔗 INCOMING CLICK DETECTED`));
    console.log(chalk.yellow(`[CLICK] Link ID: ${id}`));
    console.log(chalk.yellow(`[CLICK] Time: ${new Date().toISOString()}`));
    console.log(chalk.yellow(`[CLICK] IP: ${req.ip}`));
    console.log(chalk.yellow(`[CLICK] UA: ${(req.headers['user-agent'] || 'none').substring(0, 100)}`));
    console.log(chalk.yellow(`[CLICK] Referer: ${req.headers.referer || 'none'}`));

    try {
        const { s: signature } = req.query;

        // 1. Security Validation
        if (!googleAdsRedirector.verifySignature(id, signature)) {
            console.log(chalk.red(`[CLICK] ✗ Invalid signature`));
            return res.status(403).send('Forbidden: Invalid Signature');
        }
        console.log(chalk.green(`[CLICK] ✓ Signature valid`));

        // 2. Fetch Link Data
        const linkData = await linkStore.getLink(id);
        
        if (!linkData) {
            console.log(chalk.red(`[CLICK] ✗ Link not found`));
            return res.status(404).send('Not Found');
        }
        
        if (new Date() > new Date(linkData.expiresAt)) {
            console.log(chalk.red(`[CLICK] ✗ Link expired`));
            return res.status(410).send('Gone: Link Expired');
        }
        console.log(chalk.green(`[CLICK] ✓ Link valid, owner: ${linkData.ownerId}`));

        // 3. Get Final URL (with rotation if applicable)
        const rotations = await linkStore.getRotationsForLink(id);
        let finalUrl = rotations?.[0]?.url || linkData.destinationUrlDesktop;

        if (rotations && rotations.length > 1) {
            const totalWeight = rotations.reduce((sum, r) => sum + r.weight, 0);
            let random = Math.random() * totalWeight;
            for (const rotation of rotations) {
                if (random < rotation.weight) {
                    finalUrl = rotation.url;
                    break;
                }
                random -= rotation.weight;
            }
        }
        console.log(chalk.blue(`[CLICK] Final URL: ${finalUrl}`));

        // 4. Generate and serve challenge page
        const challengeHtml = cloaker.generateChallengePage(finalUrl, id);
        
        res.set({
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        console.log(chalk.green(`[CLICK] ✓ Serving challenge page (${Date.now() - startTime}ms)`));
        console.log(chalk.yellow.bold(`${'='.repeat(70)}\n`));
        
        res.send(challengeHtml);

    } catch (err) {
        console.error(chalk.red.bold(`[CLICK] FATAL ERROR:`), err);
        return res.status(500).send('Error');
    }
});

/**
 * =====================================================
 * CHALLENGE VERIFICATION - This is where clicks are logged
 * =====================================================
 */
router.post('/tr/v2/challenge', async (req, res) => {
    const startTime = Date.now();
    
    console.log(chalk.magenta.bold(`\n${'='.repeat(70)}`));
    console.log(chalk.magenta.bold(`[VERIFY] 🔍 CHALLENGE VERIFICATION`));
    
    try {
        const { token, linkId, signals } = req.body;
        
        console.log(chalk.cyan(`[VERIFY] Token received: ${token ? 'YES' : 'NO'}`));
        console.log(chalk.cyan(`[VERIFY] Link ID: ${linkId || 'from token'}`));
        console.log(chalk.cyan(`[VERIFY] Has client signals: ${signals ? 'YES (' + Object.keys(signals).length + ' keys)' : 'NO'}`));
        
        if (signals) {
            console.log(chalk.gray(`[VERIFY] Signal details:`));
            console.log(chalk.gray(`  jsExecuted: ${signals.jsExecuted}`));
            console.log(chalk.gray(`  webdriver: ${signals.webdriver}`));
            console.log(chalk.gray(`  hasChrome: ${signals.hasChrome}`));
            console.log(chalk.gray(`  hasCanvas: ${signals.hasCanvas}`));
            console.log(chalk.gray(`  loadTime: ${signals.loadTime}ms`));
            console.log(chalk.gray(`  screen: ${signals.screenWidth}x${signals.screenHeight}`));
        }

        // Verify token
        const verification = cloaker.verifyChallenge(token);
        
        if (!verification.isValid) {
            console.log(chalk.red(`[VERIFY] ✗ Token invalid: ${verification.error}`));
            return res.json({ redirectTo: '/' });
        }
        
        const finalUrl = verification.url;
        const verifiedLinkId = verification.linkId || linkId;
        
        console.log(chalk.green(`[VERIFY] ✓ Token valid for link: ${verifiedLinkId}`));

        // Get link data
        const linkData = await linkStore.getLink(verifiedLinkId);
        if (!linkData) {
            console.log(chalk.red(`[VERIFY] ✗ Link not found: ${verifiedLinkId}`));
            return res.json({ redirectTo: finalUrl });
        }

        // ========================================
        // BOT DETECTION
        // ========================================
        const detection = detectBot(req, signals);
        const isBot = detection.isBot;
        const clickType = isBot ? 'bot' : 'human';
        const emoji = isBot ? '🤖' : '👤';
        
        console.log(chalk.cyan.bold(`[VERIFY] ${emoji} DETECTION RESULT:`));
        console.log(chalk.cyan(`  Type: ${clickType.toUpperCase()}`));
        console.log(chalk.cyan(`  Score: ${detection.score}/100`));
        console.log(chalk.cyan(`  Confidence: ${detection.confidence}`));
        if (detection.signals.length > 0) {
            console.log(chalk.cyan(`  Reasons: ${detection.signals.slice(0, 3).join(', ')}`));
        }

        // ========================================
        // GEO LOOKUP
        // ========================================
        const ip = req.ip || 'unknown';
        let country = 'Unknown';
        try {
            const geo = await geoip.lookup(ip.replace('::ffff:', ''));
            country = geo?.country || 'Unknown';
        } catch (e) {
            console.log(chalk.yellow(`[VERIFY] GeoIP failed: ${e.message}`));
        }
        console.log(chalk.blue(`[VERIFY] Location: ${country} (${ip})`));

        // ========================================
        // LOG THE CLICK TO DATABASE
        // ========================================
        console.log(chalk.green.bold(`[VERIFY] 📝 LOGGING CLICK... `));
        
        const logResult = await linkStore.logClick({
            linkId: verifiedLinkId,
            isBot: isBot,
            ipAddress: ip,
            userAgent: req.headers['user-agent'] || 'unknown',
            country: country,
            referrer: req.headers.referer || 'Direct',
            destinationUrl: finalUrl
        });
        
        if (logResult) {
            console.log(chalk.green(`[VERIFY] ✓ Click logged successfully`));
        } else {
            console.log(chalk.red(`[VERIFY] ✗ Failed to log click`));
        }

        // ========================================
        // BROADCAST TO DASHBOARD
        // ========================================
        if (req.broadcast) {
            const payload = {
                type: 'LIVE_CLICK',
                payload: {
                    linkId: verifiedLinkId,
                    ownerId: linkData.ownerId,
                    clickType: clickType,
                    confidence: detection.confidence,
                    score: detection.score,
                    country: country,
                    timestamp: Date.now()
                }
            };
            
            console.log(chalk.green(`[VERIFY] 📡 Broadcasting to user ${linkData.ownerId}... `));
            const sentCount = req.broadcast(payload, linkData.ownerId);
            console.log(chalk.green(`[VERIFY] ✓ Broadcast sent to ${sentCount} client(s)`));
        } else {
            console.log(chalk.red(`[VERIFY] ✗ Broadcast function not available! `));
        }

        // ========================================
        // SEND REDIRECT RESPONSE
        // ========================================
        const processingTime = Date.now() - startTime;
        console.log(chalk.green.bold(`[VERIFY] ✓ COMPLETE (${processingTime}ms)`));
        console.log(chalk.green(`[VERIFY] Redirecting to: ${finalUrl}`));
        console.log(chalk.magenta.bold(`${'='.repeat(70)}\n`));

        res.json({ redirectTo: finalUrl });

    } catch (err) {
        console.error(chalk.red.bold(`[VERIFY] FATAL ERROR:`), err);
        console.error(err.stack);
        res.json({ redirectTo: '/' });
    }
});

/**
 * =====================================================
 * AUTH ROUTES (Access Key based)
 * =====================================================
 */
router.post('/api/auth/access', authLimiter, accessKeyValidationRules(), validate, async (req, res) => {
    const { accessKey } = req.body;
    try {
        const user = await auth.validateAccessKey(accessKey);
        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired access key.' });
        }
        const token = auth.sign({ id: user.id, user: user.email, role: user.role });
        res.json({ token });
    } catch (error) {
        console.error('Access key auth error:', error);
        res.status(500).json({ error: 'Server error during authentication.' });
    }
});

// Protected API routes
router.use('/api', auth.verify, apiLimiter);

// Admin-only route to generate access keys
router.post('/api/admin/generate-key', generateKeyValidationRules(), validate, async (req, res) => {
    const { targetEmail } = req.body;
    try {
        if (req.user.user !== config.adminEmail) {
            return res.status(403).json({ error: 'Forbidden: Only the admin can generate access keys.' });
        }
        const result = await auth.generateAccessKey(req.user.user, targetEmail);
        res.json({ accessKey: result.accessKey, expiresAt: result.expiresAt });
    } catch (error) {
        console.error('Generate key error:', error);
        res.status(500).json({ error: error.message || 'Server error generating key.' });
    }
});

const checkLicense = (req, res, next) => {
    const key = req.headers['x-license-key'];
    if (!key) return res.status(402).json({ error: 'Payment Required: Missing x-license-key header.' });
    const result = license.check(key);
    if (!result.ok) return res.status(402).json({ error: `Payment Required: ${result.error}` });
    next();
};

/**
 * =====================================================
 * LINK ROUTES
 * =====================================================
 */
router.get('/api/links', async (req, res) => {
    try {
        const links = await linkStore.getLinksForUser(req.user.id);
        res.json(links || []);
    } catch (err) {
        console.error('Get links error:', err);
        res.status(500).json({ error: 'Failed to fetch links' });
    }
});

router.post('/api/links', checkLicense, createLinkValidationRules(), validate, async (req, res) => {
    try {
        const { expiresAt, customDomain, rotations } = req.body;
        
        // FIX: Ensure protocol is present on custom domain
        let publicDomain = customDomain;
        
        // If a custom domain is provided, ensure it has a protocol
        if (publicDomain) {
            if (!publicDomain.startsWith('http://') && !publicDomain.startsWith('https://')) {
                publicDomain = `https://${publicDomain}`;
            }
        } else {
            // Fallback to request host if no custom domain
             publicDomain = `${req.protocol}://${req.get('host')}`;
        }
        
        console.log(chalk.blue(`[API] Creating link for user ${req.user.id}`));
        console.log(chalk.blue(`[API] Public domain: ${publicDomain}`));
        
        const newLink = await linkStore.createLinkWithRotations({
            ownerId: req.user.id,
            publicDomain,
            expiresAt,
            rotations
        });
        
        console.log(chalk.green(`[API] ✓ Link created: ${newLink.id}`));
        console.log(chalk.green(`[API] Google Ads URL: ${newLink.googleAdsUrl}`));
        
        res.status(201).json(newLink);
    } catch (error) {
        console.error('Create Link Error:', error);
        res.status(500).json({ error: 'Server error creating link.' });
    }
});

router.delete('/api/links/:id', async (req, res) => {
    const wasDeleted = await linkStore.deleteLink(req.params.id, req.user.id);
    res.sendStatus(wasDeleted ? 204 : 404);
});

router.get('/api/stats/clicks-by-day', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 14;
        const stats = await linkStore.getClicksByDay(req.user.id, days);
        res.json(stats || []);
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

router.get('/api/links/:id/analytics', async (req, res) => {
    const clicks = await linkStore.getDetailedClicksForLink(req.params.id, req.user.id);
    if (clicks === null) {
        return res.status(404).json({ error: 'Link not found or permission denied.' });
    }
    res.json(clicks);
});

/**
 * =====================================================
 * DOMAIN ROUTES
 * =====================================================
 */
router.get('/api/domains', async (req, res) => {
    try {
        const db = await getDb();
        const domains = await db.all('SELECT id, hostname FROM custom_domains WHERE ownerId = ?', req.user.id);
        res.json(domains || []);
    } catch (err) {
        console.error('Get domains error:', err);
        res.status(500).json({ error: 'Failed to fetch domains' });
    }
});

router.post('/api/domains', createDomainValidationRules(), validate, async (req, res) => {
    const { hostname } = req.body;
    try {
        const db = await getDb();
        const result = await db.run(
            'INSERT INTO custom_domains (ownerId, hostname) VALUES (?, ?)',
            req.user.id,
            hostname
        );
        res.status(201).json({ id: result.lastID, hostname });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Domain is already registered.' });
        }
        res.status(500).json({ error: 'Server error adding domain.' });
    }
});

router.delete('/api/domains/:id', async (req, res) => {
    const db = await getDb();
    const result = await db.run(
        'DELETE FROM custom_domains WHERE id = ? AND ownerId = ?',
        req.params.id,
        req.user.id
    );
    if (result.changes > 0) res.sendStatus(204);
    else res.status(404).json({ error: 'Domain not found or permission denied.' });
});

module.exports = router;
