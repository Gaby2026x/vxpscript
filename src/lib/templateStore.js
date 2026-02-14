/**
 * Template Store v1.0
 * 
 * Manages custom HTML templates for redirect pages. 
 * Allows users to save, retrieve, and manage multiple templates.
 */

const getDb = require('./database');
const { validateTemplate } = require('./htmlTemplateProcessor');
const chalk = require('chalk');

// Ensure table exists
async function ensureTableExists() {
    const db = await getDb();
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS html_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ownerId INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            htmlContent TEXT NOT NULL,
            isDefault INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(ownerId, name)
        );
        
        CREATE INDEX IF NOT EXISTS idx_templates_owner ON html_templates(ownerId);
    `);
}

let initialized = false;
async function init() {
    if (! initialized) {
        await ensureTableExists();
        initialized = true;
    }
}

const templateStore = {
    
    /**
     * Saves a new template or updates existing one
     * @param {object} options 
     * @returns {Promise<object>}
     */
    async save(options) {
        await init();
        
        const {
            ownerId,
            name,
            description = null,
            htmlContent,
            isDefault = false
        } = options;

        if (! ownerId) throw new Error('Owner ID is required');
        if (!name || typeof name !== 'string') throw new Error('Template name is required');
        if (!htmlContent || typeof htmlContent !== 'string') throw new Error('HTML content is required');

        // Validate template
        const validation = validateTemplate(htmlContent);
        if (!validation.isValid) {
            throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
        }

        const db = await getDb();

        // If setting as default, unset other defaults first
        if (isDefault) {
            await db.run(
                'UPDATE html_templates SET isDefault = 0 WHERE ownerId = ?',
                [ownerId]
            );
        }

        try {
            // Try to update existing
            const existing = await db.get(
                'SELECT id FROM html_templates WHERE ownerId = ? AND name = ? ',
                [ownerId, name]
            );

            if (existing) {
                await db.run(
                    `UPDATE html_templates 
                     SET htmlContent = ?, description = ?, isDefault = ?, updatedAt = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [htmlContent, description, isDefault ?  1 : 0, existing.id]
                );

                console.log(chalk. green(`[TEMPLATE] Updated: ${name}`));
                
                return {
                    id: existing. id,
                    name,
                    description,
                    isDefault,
                    warnings: validation.warnings,
                    updated: true
                };
            } else {
                const result = await db. run(
                    `INSERT INTO html_templates (ownerId, name, description, htmlContent, isDefault) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [ownerId, name, description, htmlContent, isDefault ?  1 : 0]
                );

                console.log(chalk.green(`[TEMPLATE] Created: ${name}`));

                return {
                    id: result. lastID,
                    name,
                    description,
                    isDefault,
                    warnings: validation.warnings,
                    created: true
                };
            }
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new Error('A template with this name already exists');
            }
            throw error;
        }
    },

    /**
     * Gets a template by name for a user
     * @param {number} ownerId 
     * @param {string} name 
     * @returns {Promise<object|null>}
     */
    async get(ownerId, name) {
        await init();
        
        const db = await getDb();
        return db.get(
            'SELECT * FROM html_templates WHERE ownerId = ?  AND name = ?',
            [ownerId, name]
        );
    },

    /**
     * Gets the default template for a user
     * @param {number} ownerId 
     * @returns {Promise<object|null>}
     */
    async getDefault(ownerId) {
        await init();
        
        const db = await getDb();
        return db.get(
            'SELECT * FROM html_templates WHERE ownerId = ?  AND isDefault = 1',
            [ownerId]
        );
    },

    /**
     * Gets all templates for a user
     * @param {number} ownerId 
     * @returns {Promise<array>}
     */
    async getAll(ownerId) {
        await init();
        
        const db = await getDb();
        return db.all(
            `SELECT id, name, description, isDefault, createdAt, updatedAt, 
                    LENGTH(htmlContent) as contentSize 
             FROM html_templates 
             WHERE ownerId = ?  
             ORDER BY isDefault DESC, updatedAt DESC`,
            [ownerId]
        );
    },

    /**
     * Deletes a template
     * @param {number} ownerId 
     * @param {string} name 
     * @returns {Promise<boolean>}
     */
    async delete(ownerId, name) {
        await init();
        
        const db = await getDb();
        const result = await db. run(
            'DELETE FROM html_templates WHERE ownerId = ? AND name = ? ',
            [ownerId, name]
        );

        if (result.changes > 0) {
            console.log(chalk.red(`[TEMPLATE] Deleted: ${name}`));
            return true;
        }

        return false;
    },

    /**
     * Sets a template as default
     * @param {number} ownerId 
     * @param {string} name 
     * @returns {Promise<boolean>}
     */
    async setDefault(ownerId, name) {
        await init();
        
        const db = await getDb();

        // Verify template exists
        const template = await db.get(
            'SELECT id FROM html_templates WHERE ownerId = ? AND name = ? ',
            [ownerId, name]
        );

        if (!template) return false;

        // Unset all defaults
        await db.run('UPDATE html_templates SET isDefault = 0 WHERE ownerId = ?', [ownerId]);

        // Set new default
        await db.run('UPDATE html_templates SET isDefault = 1 WHERE id = ?', [template.id]);

        console.log(chalk.yellow(`[TEMPLATE] Set default: ${name}`));
        return true;
    }
};

module. exports = templateStore;
