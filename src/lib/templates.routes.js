/**
 * Template Management API Routes
 */

const express = require('express');
const router = express.Router();
const templateStore = require('../lib/templateStore');
const { validateTemplate, processTemplate, getDefaultTemplate, SUPPORTED_TOKENS } = require('../lib/htmlTemplateProcessor');

/**
 * GET /api/templates - Get all templates for user
 */
router.get('/api/templates', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const templates = await templateStore.getAll(req.user.id);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/templates/tokens - Get list of supported tokens
 */
router.get('/api/templates/tokens', (req, res) => {
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

/**
 * GET /api/templates/default-system - Get the system default template
 */
router.get('/api/templates/default-system', (req, res) => {
    res.json({
        name: 'System Default',
        htmlContent: getDefaultTemplate()
    });
});

/**
 * POST /api/templates - Create/Update a template
 */
router.post('/api/templates', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

/**
 * POST /api/templates/validate - Validate a template without saving
 */
router.post('/api/templates/validate', (req, res) => {
    const { htmlContent } = req.body;

    if (!htmlContent) {
        return res.status(400).json({ error: 'HTML content is required' });
    }

    const validation = validateTemplate(htmlContent);
    res.json(validation);
});

/**
 * POST /api/templates/preview - Preview processed template
 */
router.post('/api/templates/preview', (req, res) => {
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

/**
 * GET /api/templates/:name - Get a specific template
 */
router.get('/api/templates/:name', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

/**
 * PUT /api/templates/:name/default - Set template as default
 */
router.put('/api/templates/:name/default', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

/**
 * DELETE /api/templates/:name - Delete a template
 */
router.delete('/api/templates/:name', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

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

module.exports = router;
