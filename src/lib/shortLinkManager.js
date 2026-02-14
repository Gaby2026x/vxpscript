/**
 * Short Link Manager v1.1
 * 
 * Fixes:
 * - Removed incorrect .toLowerCase() on resolve/tracking (Fixed 404s)
 * - Improved isActive check for robustness
 * - Fixed boolean/integer conversion in update()
 */

const crypto = require('crypto');
const getDb = require('./database');
const chalk = require('chalk');

// Configuration
const CONFIG = {
    // Characters used for short code generation (URL-safe)
    CHARSET: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    
    // Default short code length
    DEFAULT_CODE_LENGTH: 6,
    
    // Minimum and maximum code lengths
    MIN_CODE_LENGTH: 4,
    MAX_CODE_LENGTH: 20,
    
    // Maximum retry attempts for unique code generation
    MAX_GENERATION_ATTEMPTS: 10,
    
    // Reserved slugs that cannot be used as aliases
    RESERVED_SLUGS: [
        'api', 'admin', 'dashboard', 'login', 'logout', 'register', 'signup',
        'tr', 'track', 'tracking', 'health', 'status', 'static', 'assets',
        'js', 'css', 'img', 'images', 'fonts', 'favicon', 'robots',
        's', 'short', 'go', 'l', 'link', 'u', 'url', 'r', 'redirect'
    ],
    
    // URL validation regex
    URL_REGEX: /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/i,
    
    // Alias validation regex (alphanumeric, hyphens, underscores)
    ALIAS_REGEX: /^[a-zA-Z0-9_-]+$/
};

/**
 * Generates a cryptographically secure random short code
 * @param {number} length - Length of the code to generate
 * @returns {string}
 */
function generateSecureCode(length = CONFIG.DEFAULT_CODE_LENGTH) {
    const bytes = crypto.randomBytes(length);
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += CONFIG.CHARSET[bytes[i] % CONFIG.CHARSET.length];
    }
    
    return result;
}

/**
 * Validates a URL
 * @param {string} url 
 * @returns {object} - { isValid, error }
 */
function validateUrl(url) {
    if (!url || typeof url !== 'string') {
        return { isValid: false, error: 'URL is required' };
    }

    const trimmedUrl = url.trim();
    
    if (trimmedUrl.length === 0) {
        return { isValid: false, error: 'URL cannot be empty' };
    }
    
    if (trimmedUrl.length > 2048) {
        return { isValid: false, error: 'URL exceeds maximum length of 2048 characters' };
    }

    // Check for valid protocol
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        return { isValid: false, error: 'URL must start with http:// or https://' };
    }

    // Validate URL format
    if (!CONFIG.URL_REGEX.test(trimmedUrl)) {
        return { isValid: false, error: 'Invalid URL format' };
    }

    // Check for potentially dangerous URLs
    const lowerUrl = trimmedUrl.toLowerCase();
    if (lowerUrl.includes('javascript:') || lowerUrl.includes('data:') || lowerUrl.includes('vbscript:')) {
        return { isValid: false, error: 'URL contains prohibited protocol' };
    }

    return { isValid: true, error: null };
}

/**
 * Validates a custom alias
 * @param {string} alias 
 * @returns {object} - { isValid, error }
 */
function validateAlias(alias) {
    if (!alias || typeof alias !== 'string') {
        return { isValid: false, error: 'Alias is required' };
    }

    const trimmedAlias = alias.trim(); // Removed toLowerCase() to allow case-sensitive custom aliases if desired
    
    if (trimmedAlias.length < CONFIG.MIN_CODE_LENGTH) {
        return { isValid: false, error: `Alias must be at least ${CONFIG.MIN_CODE_LENGTH} characters` };
    }
    
    if (trimmedAlias.length > CONFIG.MAX_CODE_LENGTH) {
        return { isValid: false, error: `Alias cannot exceed ${CONFIG.MAX_CODE_LENGTH} characters` };
    }

    if (!CONFIG.ALIAS_REGEX.test(trimmedAlias)) {
        return { isValid: false, error: 'Alias can only contain letters, numbers, hyphens, and underscores' };
    }

    if (CONFIG.RESERVED_SLUGS.includes(trimmedAlias.toLowerCase())) {
        return { isValid: false, error: 'This alias is reserved and cannot be used' };
    }

    return { isValid: true, error: null };
}

/**
 * Ensures the required tables exist in the database
 */
async function ensureTablesExist() {
    const db = await getDb();
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS short_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            targetUrl TEXT NOT NULL,
            ownerId INTEGER,
            title TEXT,
            clicks INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            expiresAt DATETIME,
            isActive INTEGER DEFAULT 1,
            lastClickAt DATETIME,
            metadata TEXT,
            FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE SET NULL
        );
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS short_link_clicks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shortLinkId INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            ipAddress TEXT,
            userAgent TEXT,
            referrer TEXT,
            country TEXT,
            FOREIGN KEY(shortLinkId) REFERENCES short_links(id) ON DELETE CASCADE
        );
    `);
    
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_links_owner ON short_links(ownerId);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_links_active ON short_links(isActive);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_link_clicks_link ON short_link_clicks(shortLinkId);`);
}


// Initialize tables on module load
let tablesInitialized = false;
async function initTables() {
    if (!tablesInitialized) {
        await ensureTablesExist();
        tablesInitialized = true;
    }
}

/**
 * Short Link Manager Object
 */
const shortLinkManager = {
    
    /**
     * Creates a new short link
     * @param {object} options 
     * @returns {Promise<object>}
     */
    async create(options) {
        await initTables();
        
        const {
            targetUrl,
            ownerId = null,
            alias = null,
            title = null,
            expiresAt = null,
            metadata = null
        } = options;

        // Validate target URL
        const urlValidation = validateUrl(targetUrl);
        if (!urlValidation.isValid) {
            throw new Error(urlValidation.error);
        }

        const db = await getDb();
        let slug;

        // If custom alias provided, validate and use it
        if (alias) {
            const aliasValidation = validateAlias(alias);
            if (!aliasValidation.isValid) {
                throw new Error(aliasValidation.error);
            }
            
            slug = alias.trim(); // Do NOT force lowercase to preserve user intent

            // Check if alias already exists
            const existing = await db.get('SELECT id FROM short_links WHERE slug = ?', [slug]);
            if (existing) {
                throw new Error('This alias is already in use');
            }
        } else {
            // Generate unique short code
            let attempts = 0;
            let isUnique = false;

            while (!isUnique && attempts < CONFIG.MAX_GENERATION_ATTEMPTS) {
                slug = generateSecureCode(CONFIG.DEFAULT_CODE_LENGTH);
                const existing = await db.get('SELECT id FROM short_links WHERE slug = ?', [slug]);
                if (!existing) {
                    isUnique = true;
                }
                attempts++;
            }

            if (!isUnique) {
                // Increase length and try again if collisions are frequent
                slug = generateSecureCode(CONFIG.DEFAULT_CODE_LENGTH + 2);
                const existing = await db.get('SELECT id FROM short_links WHERE slug = ?', [slug]);
                if (existing) {
                    throw new Error('Failed to generate unique short code. Please try again.');
                }
            }
        }

        // Insert the short link
        try {
            const result = await db.run(
                `INSERT INTO short_links (slug, targetUrl, ownerId, title, expiresAt, metadata, isActive) 
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [
                    slug,
                    targetUrl.trim(),
                    ownerId,
                    title,
                    expiresAt,
                    metadata ? JSON.stringify(metadata) : null
                ]
            );

            console.log(chalk.green(`[SHORT-LINK] Created: /${slug} -> ${targetUrl.substring(0, 50)}...`));

            return {
                id: result.lastID,
                slug,
                targetUrl: targetUrl.trim(),
                shortUrl: `/s/${slug}`,
                ownerId,
                title,
                clicks: 0,
                createdAt: new Date().toISOString(),
                expiresAt,
                isActive: 1
            };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new Error('This alias is already in use');
            }
            throw error;
        }
    },

    /**
     * Resolves a short link slug to its target URL
     * @param {string} slug 
     * @returns {Promise<object|null>}
     */
    async resolve(slug) {
        await initTables();
        
        if (!slug || typeof slug !== 'string') {
            return null;
        }

        const db = await getDb();
        
        // FIXED: Removed .toLowerCase() and added robust isActive check
        const link = await db.get(
            `SELECT * FROM short_links WHERE slug = ? AND (isActive = 1 OR isActive IS NULL)`,
            [slug] 
        );

        if (!link) {
            return null;
        }

        // Check expiration
        if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
            return null;
        }

        return {
            id: link.id,
            slug: link.slug,
            targetUrl: link.targetUrl,
            ownerId: link.ownerId,
            title: link.title,
            clicks: link.clicks,
            createdAt: link.createdAt,
            expiresAt: link.expiresAt,
            metadata: link.metadata ? JSON.parse(link.metadata) : null
        };
    },

    /**
     * Records a click on a short link
     * @param {string} slug 
     * @param {object} clickData 
     * @returns {Promise<boolean>}
     */
    async recordClick(slug, clickData = {}) {
        await initTables();
        
        const db = await getDb();
        // FIXED: Removed .toLowerCase()
        const link = await db.get('SELECT id FROM short_links WHERE slug = ?', [slug]);
        
        if (!link) {
            return false;
        }

        const { ipAddress = null, userAgent = null, referrer = null, country = null } = clickData;

        try {
            // Using a simpler update/insert flow to avoid transaction lock issues on some SQLite configs
            await db.run(
                'UPDATE short_links SET clicks = clicks + 1, lastClickAt = CURRENT_TIMESTAMP WHERE id = ?',
                [link.id]
            );

            await db.run(
                `INSERT INTO short_link_clicks (shortLinkId, ipAddress, userAgent, referrer, country) 
                 VALUES (?, ?, ?, ?, ?)`,
                [link.id, ipAddress, userAgent, referrer, country]
            );
            
            console.log(chalk.cyan(`[SHORT-LINK] Click recorded: /${slug} from ${country || 'Unknown'}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`[SHORT-LINK] Failed to record click: ${error.message}`));
            return false;
        }
    },

    /**
     * Gets all short links for a user
     * @param {number} ownerId 
     * @returns {Promise<array>}
     */
    async getByOwner(ownerId) {
        await initTables();
        
        const db = await getDb();
        const links = await db.all(
            'SELECT * FROM short_links WHERE ownerId = ? ORDER BY createdAt DESC',
            [ownerId]
        );

        return links.map(link => ({
            ...link,
            shortUrl: `/s/${link.slug}`,
            metadata: link.metadata ? JSON.parse(link.metadata) : null
        }));
    },

    /**
     * Gets analytics for a short link
     * @param {string} slug 
     * @param {number} ownerId - For ownership verification
     * @returns {Promise<object|null>}
     */
    async getAnalytics(slug, ownerId) {
        await initTables();
        
        const db = await getDb();
        
        // Verify ownership - FIXED: Removed toLowerCase()
        const link = await db.get(
            'SELECT * FROM short_links WHERE slug = ? AND ownerId = ?',
            [slug, ownerId]
        );

        if (!link) {
            return null;
        }

        // Get click history
        const clicks = await db.all(
            `SELECT timestamp, country, referrer 
             FROM short_link_clicks 
             WHERE shortLinkId = ? 
             ORDER BY timestamp DESC 
             LIMIT 100`,
            [link.id]
        );

        // Get clicks by country
        const byCountry = await db.all(
            `SELECT country, COUNT(*) as count 
             FROM short_link_clicks 
             WHERE shortLinkId = ? 
             GROUP BY country 
             ORDER BY count DESC`,
            [link.id]
        );

        // Get clicks by day (last 30 days)
        const byDay = await db.all(
            `SELECT date(timestamp) as date, COUNT(*) as count 
             FROM short_link_clicks 
             WHERE shortLinkId = ? AND timestamp >= date('now', '-30 days')
             GROUP BY date(timestamp) 
             ORDER BY date ASC`,
            [link.id]
        );

        return {
            link: {
                ...link,
                shortUrl: `/s/${link.slug}`,
                metadata: link.metadata ? JSON.parse(link.metadata) : null
            },
            totalClicks: link.clicks,
            recentClicks: clicks,
            clicksByCountry: byCountry,
            clicksByDay: byDay
        };
    },

    /**
     * Updates a short link
     * @param {string} slug 
     * @param {number} ownerId 
     * @param {object} updates 
     * @returns {Promise<boolean>}
     */
    async update(slug, ownerId, updates) {
        await initTables();
        
        const db = await getDb();
        
        // Verify ownership - FIXED: Removed toLowerCase()
        const link = await db.get(
            'SELECT id FROM short_links WHERE slug = ? AND ownerId = ?',
            [slug, ownerId]
        );

        if (!link) {
            return false;
        }

        const allowedUpdates = ['targetUrl', 'title', 'expiresAt', 'isActive'];
        const setClauses = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(key)) {
                if (key === 'targetUrl') {
                    const validation = validateUrl(value);
                    if (!validation.isValid) {
                        throw new Error(validation.error);
                    }
                    values.push(value);
                } else if (key === 'isActive') {
                    // FIXED: Ensure integer storage for boolean
                    values.push(value ? 1 : 0);
                } else {
                    values.push(value);
                }
                setClauses.push(`${key} = ?`);
            }
        }

        if (setClauses.length === 0) {
            return false;
        }

        values.push(link.id);
        
        await db.run(
            `UPDATE short_links SET ${setClauses.join(', ')} WHERE id = ?`,
            values
        );

        console.log(chalk.yellow(`[SHORT-LINK] Updated: /${slug}`));
        return true;
    },

    /**
     * Deletes a short link
     * @param {string} slug 
     * @param {number} ownerId 
     * @returns {Promise<boolean>}
     */
    async delete(slug, ownerId) {
        await initTables();
        
        const db = await getDb();
        
        // FIXED: Removed toLowerCase()
        const result = await db.run(
            'DELETE FROM short_links WHERE slug = ? AND ownerId = ?',
            [slug, ownerId]
        );

        if (result.changes > 0) {
            console.log(chalk.red(`[SHORT-LINK] Deleted: /${slug}`));
            return true;
        }

        return false;
    },

    /**
     * Checks if a slug is available
     * @param {string} slug 
     * @returns {Promise<boolean>}
     */
    async isSlugAvailable(slug) {
        await initTables();
        
        if (!slug || typeof slug !== 'string') {
            return false;
        }

        const validation = validateAlias(slug);
        if (!validation.isValid) {
            return false;
        }

        const db = await getDb();
        // FIXED: Removed toLowerCase()
        const existing = await db.get('SELECT id FROM short_links WHERE slug = ?', [slug]);
        
        return !existing;
    },

    /**
     * Gets statistics summary for a user
     * @param {number} ownerId 
     * @returns {Promise<object>}
     */
    async getStats(ownerId) {
        await initTables();
        
        const db = await getDb();

        const stats = await db.get(
            `SELECT 
                COUNT(*) as totalLinks,
                SUM(clicks) as totalClicks,
                SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeLinks
             FROM short_links 
             WHERE ownerId = ?`,
            [ownerId]
        );

        return {
            totalLinks: stats.totalLinks || 0,
            totalClicks: stats.totalClicks || 0,
            activeLinks: stats.activeLinks || 0
        };
    }
};

module.exports = shortLinkManager;
