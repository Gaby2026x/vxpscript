const getDb = require('./database');
const googleAdsRedirector = require('./googleAdsRedirector');
const chalk = require('chalk');

const linkStore = {
    async createLinkWithRotations({ ownerId, publicDomain, expiresAt, rotations, templateId }) {
        const db = await getDb();
        
        const firstUrl = rotations[0]?.url;
        if (!firstUrl) throw new Error("Invalid rotation data: At least one destination URL is required.");
        
        const { googleAdsUrl, internalId } = googleAdsRedirector.createRedirect(firstUrl, publicDomain);

        await db.run('BEGIN TRANSACTION');
        try {
            // MODIFIED: Added templateId to the INSERT statement
            await db.run(
                `INSERT INTO links (id, ownerId, googleAdsUrl, destinationUrlDesktop, expiresAt, clicks, botClicks, templateId) 
                 VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
                [internalId, ownerId, googleAdsUrl, firstUrl, expiresAt, templateId]
            );

            for (const rotation of rotations) {
                await db.run(
                    `INSERT INTO link_destinations (linkId, url, platform, weight) 
                     VALUES (?, ?, ?, ?)`,
                    [internalId, rotation.url, rotation.platform || 'desktop', rotation.weight || 100]
                );
            }
            
            await db.run('COMMIT');
            console.log(chalk.green(`[LINKSTORE] ✓ Created link ${internalId} for user ${ownerId}`));
            
            return { 
                id: internalId, 
                ownerId, 
                googleAdsUrl, 
                destinationUrlDesktop: firstUrl, 
                expiresAt, 
                clicks: 0, 
                botClicks: 0,
                templateId
            };
        } catch (error) {
            await db.run('ROLLBACK');
            console.error(chalk.red(`[LINKSTORE] Failed to create link: ${error.message}`));
            throw error;
        }
    },

    async getLinksForUser(ownerId) {
        const db = await getDb();
        return db.all('SELECT * FROM links WHERE ownerId = ? ORDER BY createdAt DESC', ownerId);
    },
    
    async getRotationsForLink(linkId) {
        const db = await getDb();
        return db.all('SELECT * FROM link_destinations WHERE linkId = ?', linkId);
    },

    async getLink(id) {
        const db = await getDb();
        // MODIFIED: Fetches template content along with the link
        return db.get(`
            SELECT 
                l.*,
                t.htmlContent
            FROM links l
            LEFT JOIN link_templates t ON l.templateId = t.id
            WHERE l.id = ?
        `, id);
    },
    
    async deleteLink(id, ownerId) {
        const db = await getDb();
        const link = await db.get('SELECT id FROM links WHERE id = ? AND ownerId = ?', [id, ownerId]);
        if (!link) throw new Error("Link not found or permission denied.");

        await db.run('BEGIN TRANSACTION');
        try {
            await db.run('DELETE FROM link_destinations WHERE linkId = ?', id);
            await db.run('DELETE FROM clicks WHERE linkId = ?', id);
            await db.run('DELETE FROM links WHERE id = ?', id);
            await db.run('COMMIT');
            return true;
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    },
    
    async logClick({ linkId, isBot, ipAddress, userAgent, country, referrer, destinationUrl }) {
        const db = await getDb();
        const isBotInt = isBot ? 1 : 0;
        const emoji = isBotInt ? '🤖' : '👤';
        
        console.log(chalk.cyan(`[LINKSTORE] ${emoji} Logging ${isBotInt ? 'BOT' : 'HUMAN'} click for ${linkId}`));

        try {
            // Check if this IP has clicked this link before (unique click tracking)
            let isUnique = 0;
            if (!isBotInt && ipAddress) {
                const existing = await db.get(
                    'SELECT id FROM clicks WHERE linkId = ? AND ipAddress = ? AND isBot = 0 LIMIT 1',
                    [linkId, ipAddress]
                );
                isUnique = existing ? 0 : 1;
            }

            await db.run(
                `INSERT INTO clicks (linkId, isBot, ipAddress, userAgent, country, referrer, destinationUrl, timestamp, isUnique) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
                [linkId, isBotInt, ipAddress, userAgent, country, referrer, destinationUrl, isUnique]
            );
            
            if (isBotInt) {
                await db.run('UPDATE links SET botClicks = COALESCE(botClicks, 0) + 1 WHERE id = ?', linkId);
            } else {
                await db.run('UPDATE links SET clicks = COALESCE(clicks, 0) + 1 WHERE id = ?', linkId);
            }
            
            return true;
        } catch (err) {
            console.error(chalk.red(`[LINKSTORE] ✗ Error logging click: ${err.message}`));
            return false;
        }
    },
    
    async getClicksByDay(ownerId, days) {
        const db = await getDb();
        return db.all(`
            SELECT 
                date(timestamp) as date,
                SUM(CASE WHEN isBot = 0 THEN 1 ELSE 0 END) as humanClicks,
                SUM(CASE WHEN isBot = 1 THEN 1 ELSE 0 END) as botClicks
            FROM clicks 
            WHERE linkId IN (SELECT id FROM links WHERE ownerId = ?)
            AND timestamp >= date('now', '-' || ? || ' days')
            GROUP BY date(timestamp)
            ORDER BY date(timestamp) ASC
        `, [ownerId, days]);
    },

    async getDetailedClicksForLink(linkId, ownerId) {
        const db = await getDb();
        const link = await db.get('SELECT id FROM links WHERE id = ? AND ownerId = ?', [linkId, ownerId]);
        if (!link) return null;

        const clicks = await db.all(
            'SELECT * FROM clicks WHERE linkId = ? ORDER BY timestamp DESC LIMIT 100',
            linkId
        );
        
        return clicks.map(c => ({ ...c, isBot: c.isBot === 1, isUnique: c.isUnique === 1 }));
    },

    /**
     * Update link tags and notes
     */
    async updateLinkMeta(linkId, ownerId, { tags, notes }) {
        const db = await getDb();
        const link = await db.get('SELECT id FROM links WHERE id = ? AND ownerId = ?', [linkId, ownerId]);
        if (!link) return false;

        const updates = [];
        const values = [];

        if (tags !== undefined) {
            updates.push('tags = ?');
            values.push(typeof tags === 'string' ? tags : JSON.stringify(tags));
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }

        if (updates.length === 0) return false;

        values.push(linkId);
        await db.run(`UPDATE links SET ${updates.join(', ')} WHERE id = ?`, values);
        return true;
    },

    /**
     * Get dashboard summary statistics for a user
     */
    async getDashboardStats(ownerId) {
        const db = await getDb();

        const totals = await db.get(`
            SELECT 
                COALESCE(SUM(clicks), 0) as totalHuman,
                COALESCE(SUM(botClicks), 0) as totalBot,
                COUNT(*) as totalLinks
            FROM links WHERE ownerId = ?
        `, [ownerId]);

        const uniqueClicks = await db.get(`
            SELECT COUNT(*) as count FROM clicks 
            WHERE linkId IN (SELECT id FROM links WHERE ownerId = ?) 
            AND isBot = 0 AND isUnique = 1
        `, [ownerId]);

        const topCountries = await db.all(`
            SELECT country, COUNT(*) as count 
            FROM clicks 
            WHERE linkId IN (SELECT id FROM links WHERE ownerId = ?) 
            AND isBot = 0 AND country IS NOT NULL AND country != 'Unknown'
            GROUP BY country 
            ORDER BY count DESC 
            LIMIT 5
        `, [ownerId]);

        const topReferrers = await db.all(`
            SELECT referrer, COUNT(*) as count 
            FROM clicks 
            WHERE linkId IN (SELECT id FROM links WHERE ownerId = ?) 
            AND isBot = 0 AND referrer IS NOT NULL AND referrer != 'Direct' AND referrer != ''
            GROUP BY referrer 
            ORDER BY count DESC 
            LIMIT 5
        `, [ownerId]);

        const totalClicks = (totals.totalHuman || 0) + (totals.totalBot || 0);
        const conversionRate = totalClicks > 0 
            ? ((totals.totalHuman / totalClicks) * 100).toFixed(1) 
            : '0.0';

        return {
            totalHuman: totals.totalHuman || 0,
            totalBot: totals.totalBot || 0,
            totalLinks: totals.totalLinks || 0,
            uniqueClicks: uniqueClicks?.count || 0,
            conversionRate: parseFloat(conversionRate),
            topCountries,
            topReferrers
        };
    },

    /**
     * Export clicks data for a user (JSON format for CSV conversion on client)
     */
    async exportClicks(ownerId, { linkId, days = 30 } = {}) {
        const db = await getDb();

        let query = `
            SELECT 
                c.timestamp, c.linkId, c.isBot, c.ipAddress, c.country, 
                c.referrer, c.userAgent, c.destinationUrl, c.isUnique,
                l.googleAdsUrl, l.tags, l.notes
            FROM clicks c
            JOIN links l ON c.linkId = l.id
            WHERE l.ownerId = ?
            AND c.timestamp >= datetime('now', '-' || ? || ' days')
        `;
        const params = [ownerId, days];

        if (linkId) {
            query += ' AND c.linkId = ?';
            params.push(linkId);
        }

        query += ' ORDER BY c.timestamp DESC LIMIT 10000';

        const rows = await db.all(query, params);
        return rows.map(r => ({
            ...r,
            isBot: r.isBot === 1,
            isUnique: r.isUnique === 1
        }));
    },

    /**
     * Search links by tag, destination URL, or notes
     */
    async searchLinks(ownerId, query) {
        const db = await getDb();
        const searchTerm = `%${query}%`;
        return db.all(`
            SELECT * FROM links 
            WHERE ownerId = ? 
            AND (
                destinationUrlDesktop LIKE ? 
                OR tags LIKE ? 
                OR notes LIKE ? 
                OR id LIKE ?
            )
            ORDER BY createdAt DESC
        `, [ownerId, searchTerm, searchTerm, searchTerm, searchTerm]);
    },

    /**
     * Bulk delete links
     */
    async bulkDeleteLinks(linkIds, ownerId) {
        const db = await getDb();
        if (!linkIds || linkIds.length === 0) return 0;

        const placeholders = linkIds.map(() => '?').join(',');
        
        await db.run('BEGIN');
        try {
            await db.run(
                `DELETE FROM link_destinations WHERE linkId IN (${placeholders})`,
                linkIds
            );
            await db.run(
                `DELETE FROM clicks WHERE linkId IN (${placeholders})`,
                linkIds
            );
            const result = await db.run(
                `DELETE FROM links WHERE id IN (${placeholders}) AND ownerId = ?`,
                [...linkIds, ownerId]
            );
            await db.run('COMMIT');
            return result.changes;
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }
};

module.exports = linkStore;
