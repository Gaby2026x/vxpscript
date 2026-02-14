/**
 * Short Links API Routes
 * Handles all short link operations
 */

const express = require('express');
const router = express.Router();
// Ensure this path matches your folder structure. 
// If this file is in 'src/routes/', this path is correct.
// If this file is in 'src/', change to './lib/shortLinkManager'
const shortLinkManager = require('../lib/shortLinkManager'); 
const geoip = require('geoip-lite');
const chalk = require('chalk');

/**
 * GET /s/:slug - Redirect short link (PUBLIC)
 */
router.get('/s/:slug', async (req, res) => {
    const { slug } = req.params;
    
    console.log(chalk.cyan(`[SHORT-LINK] Resolving: /${slug}`));

    try {
        const link = await shortLinkManager.resolve(slug);
        
        if (!link) {
            console.log(chalk.red(`[SHORT-LINK] Not found: /${slug}`));
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Link Not Found</title></head>
                <body style="font-family: sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:#fff;">
                    <div style="text-align:center;">
                        <h1>404</h1>
                        <p>This short link does not exist or has expired.</p>
                    </div>
                </body>
                </html>
            `);
        }

        // Record click asynchronously (don't wait)
        const ip = req.ip || req.connection.remoteAddress;
        // Fixed: removed space in replace string and IP prefix
        const geo = geoip.lookup(ip.replace('::ffff:', ''));
        
        shortLinkManager.recordClick(slug, {
            ipAddress: ip,
            userAgent: req.headers['user-agent'] || '',
            referrer: req.headers['referer'] || req.headers['referrer'] || '',
            country: geo?.country || 'Unknown'
        }).catch(err => console.error('[SHORT-LINK] Click record error:', err));

        // Redirect
        console.log(chalk.green(`[SHORT-LINK] Redirecting /${slug} -> ${link.targetUrl}`));
        res.redirect(301, link.targetUrl);

    } catch (error) {
        console.error(chalk.red(`[SHORT-LINK] Error: ${error.message}`));
        res.status(500).send('Internal Server Error');
    }
});

/**
 * POST /api/short-links - Create a new short link (PROTECTED)
 */
router.post('/api/short-links', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { targetUrl, alias, title, expiresAt } = req.body;

    try {
        const result = await shortLinkManager.create({
            targetUrl,
            ownerId: req.user.id,
            alias: alias || null,
            title: title || null,
            expiresAt: expiresAt || null
        });

        // Build full short URL
        const protocol = req.protocol;
        const host = req.get('host');
        result.fullShortUrl = `${protocol}://${host}/s/${result.slug}`;

        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/short-links - Get all short links for user (PROTECTED)
 */
router.get('/api/short-links', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const links = await shortLinkManager.getByOwner(req.user.id);
        
        // Add full URLs
        const protocol = req.protocol;
        const host = req.get('host');
        
        const enrichedLinks = links.map(link => ({
            ...link,
            fullShortUrl: `${protocol}://${host}/s/${link.slug}`
        }));

        res.json(enrichedLinks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/short-links/stats - Get short link statistics (PROTECTED)
 */
router.get('/api/short-links/stats', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const stats = await shortLinkManager.getStats(req.user.id);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/short-links/check/:slug - Check if slug is available (PROTECTED)
 */
router.get('/api/short-links/check/:slug', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { slug } = req.params;

    try {
        const available = await shortLinkManager.isSlugAvailable(slug);
        res.json({ slug, available });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/short-links/:slug/analytics - Get analytics for a short link (PROTECTED)
 */
// Fixed: removed space in route parameter :slug
router.get('/api/short-links/:slug/analytics', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

/**
 * PUT /api/short-links/:slug - Update a short link (PROTECTED)
 */
router.put('/api/short-links/:slug', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

/**
 * DELETE /api/short-links/:slug - Delete a short link (PROTECTED)
 */
router.delete('/api/short-links/:slug', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

module.exports = router;
