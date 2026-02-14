const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const chalk = require('chalk');

let dbPromise = null;

async function initializeDatabase() {
    try {
        // Render.com persistent disk path vs Local development path
        const mountPath = process.env.RENDER_DISK_MOUNT_PATH;
        const dbPath = mountPath 
            ? path.join(mountPath, 'production.db')
            : path.join(__dirname, '../../production.db'); // Stored in project root for local dev

        console.log(chalk.blue.bold(`[DATABASE] Connecting to: ${dbPath}`));
        
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        console.log(chalk.green('[DATABASE] Connection successful. Checking schema... '));
        
        // Performance optimizations
        await db.exec(`PRAGMA journal_mode = WAL;`);
        await db.exec(`PRAGMA foreign_keys = ON;`);
        
        // 1. Users Table (Access Key based auth)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                accessKey TEXT UNIQUE,
                keyExpiresAt DATETIME,
                isActive INTEGER DEFAULT 1,
                role TEXT DEFAULT 'user' NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Links Table
        // Updated Foreign Key reference to use link_templates
        await db.exec(`
            CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                ownerId INTEGER NOT NULL,
                googleAdsUrl TEXT NOT NULL,
                destinationUrlDesktop TEXT,
                templateId INTEGER,
                clicks INTEGER DEFAULT 0,
                botClicks INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiresAt DATETIME NOT NULL,
                FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(templateId) REFERENCES link_templates(id) ON DELETE SET NULL
            );
        `);
        
        // 3. Link Destinations
        await db.exec(`
            CREATE TABLE IF NOT EXISTS link_destinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                linkId TEXT NOT NULL,
                url TEXT NOT NULL,
                weight INTEGER DEFAULT 100 NOT NULL,
                platform TEXT DEFAULT 'desktop' NOT NULL,
                FOREIGN KEY(linkId) REFERENCES links(id) ON DELETE CASCADE
            );
        `);

        // 4. Clicks Table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS clicks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                linkId TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                isBot INTEGER DEFAULT 0,
                ipAddress TEXT,
                userAgent TEXT,
                country TEXT,
                referrer TEXT,
                destinationUrl TEXT,
                isUnique INTEGER DEFAULT 0,
                FOREIGN KEY(linkId) REFERENCES links(id) ON DELETE CASCADE
            );
        `);

        // 5. Custom Domains
        await db.exec(`
            CREATE TABLE IF NOT EXISTS custom_domains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ownerId INTEGER NOT NULL,
                hostname TEXT UNIQUE NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // 6. Short Links Table
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

        // 7. Short Link Clicks Table
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

        // 8. Link Templates Table (Renamed from html_templates to match server code)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS link_templates (
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
        `);

        // --- SCHEMA MIGRATIONS ---
        console.log(chalk.yellow('[DATABASE] Checking for necessary schema migrations...'));
        try {
            // MIGRATION: Transition users table from password-based to access-key-based auth
            const usersInfo = await db.all("PRAGMA table_info(users)");
            const hasAccessKey = usersInfo.some(col => col.name === 'accessKey');

            if (!hasAccessKey) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding access-key columns to users table...'));
                await db.exec(`ALTER TABLE users ADD COLUMN accessKey TEXT`);
                await db.exec(`ALTER TABLE users ADD COLUMN keyExpiresAt DATETIME`);
                await db.exec(`ALTER TABLE users ADD COLUMN isActive INTEGER DEFAULT 1`);
                await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_accessKey ON users(accessKey)`);
                console.log(chalk.green('[DATABASE] ✓ Users table migrated to access-key auth.'));
            }

            // FIX 1: Rename html_templates to link_templates if it exists (from previous wrong code)
            const htmlTemplatesExists = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='html_templates'");
            if (htmlTemplatesExists.length > 0) {
                 const linkTemplatesExists = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='link_templates'");
                 if (linkTemplatesExists.length === 0) {
                     console.log(chalk.cyan('[DATABASE] Migrating: Renaming html_templates to link_templates...'));
                     await db.exec('ALTER TABLE html_templates RENAME TO link_templates');
                 }
            }

            // FIX 2: Check 'links' table for missing templateId
            const linksInfo = await db.all("PRAGMA table_info(links)");
            const hasTemplateId = linksInfo.some(col => col.name === 'templateId');
            if (!hasTemplateId) {
                 console.log(chalk.cyan('[DATABASE] Migrating: Adding missing "templateId" column to links...'));
                 await db.exec(`ALTER TABLE links ADD COLUMN templateId INTEGER DEFAULT NULL`);
            }

            // FIX 3: Check 'short_links' table for missing columns
            const shortLinksInfo = await db.all("PRAGMA table_info(short_links)");
            
            const hasIsActive = shortLinksInfo.some(col => col.name === 'isActive');
            if (!hasIsActive) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding missing "isActive" column to short_links...'));
                await db.exec(`ALTER TABLE short_links ADD COLUMN isActive INTEGER DEFAULT 1`);
            }

            const hasLastClickAt = shortLinksInfo.some(col => col.name === 'lastClickAt');
            if (!hasLastClickAt) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding missing "lastClickAt" column to short_links...'));
                await db.exec(`ALTER TABLE short_links ADD COLUMN lastClickAt DATETIME`);
            }

            const hasMetadata = shortLinksInfo.some(col => col.name === 'metadata');
            if (!hasMetadata) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding missing "metadata" column to short_links...'));
                await db.exec(`ALTER TABLE short_links ADD COLUMN metadata TEXT`);
            }

            // FIX 4: Add 'tags' column to 'links' table for link tagging
            const linksInfoTags = await db.all("PRAGMA table_info(links)");
            const hasTags = linksInfoTags.some(col => col.name === 'tags');
            if (!hasTags) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding "tags" column to links...'));
                await db.exec(`ALTER TABLE links ADD COLUMN tags TEXT`);
            }

            // FIX 5: Add 'notes' column to 'links' table
            const hasNotes = linksInfoTags.some(col => col.name === 'notes');
            if (!hasNotes) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding "notes" column to links...'));
                await db.exec(`ALTER TABLE links ADD COLUMN notes TEXT`);
            }

            // FIX 6: Add 'isUnique' column to 'clicks' table
            const clicksInfo = await db.all("PRAGMA table_info(clicks)");
            const hasIsUnique = clicksInfo.some(col => col.name === 'isUnique');
            if (!hasIsUnique) {
                console.log(chalk.cyan('[DATABASE] Migrating: Adding "isUnique" column to clicks...'));
                await db.exec(`ALTER TABLE clicks ADD COLUMN isUnique INTEGER DEFAULT 0`);
            }

        } catch (migError) {
            console.warn(chalk.yellow('[DATABASE] Migration warning (non-fatal):'), migError.message);
        }
        // ------------------------------------------------

        // Create indexes for new tables
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_links_owner ON short_links(ownerId);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_links_active ON short_links(isActive);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_short_link_clicks_link ON short_link_clicks(shortLinkId);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_templates_owner ON link_templates(ownerId);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_links_template ON links(templateId);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_clicks_linkid ON clicks(linkId);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_clicks_timestamp ON clicks(timestamp);`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_clicks_ip ON clicks(ipAddress);`);

        // --- SELF-HEALING ---
        // Fixes any potential data integrity issues on startup
        console.log(chalk.yellow('[DATABASE] Running self-healing consistency check... '));
        
        await db.run(`UPDATE links SET clicks = 0 WHERE clicks IS NULL`);
        await db.run(`UPDATE links SET botClicks = 0 WHERE botClicks IS NULL`);
        await db.run(`UPDATE clicks SET isBot = 0 WHERE isBot IS NULL`);
        await db.run(`UPDATE short_links SET clicks = 0 WHERE clicks IS NULL`);
        await db.run(`UPDATE short_links SET isActive = 1 WHERE isActive IS NULL`);

        console.log(chalk.green.bold('[DATABASE] Database is healthy and ready. '));
        return db;

    } catch (error) {
        console.error(chalk.red.bold('[DATABASE] FATAL ERROR:'), error);
        process.exit(1);
    }
}

function getDb() {
    if (!dbPromise) {
        dbPromise = initializeDatabase();
    }
    return dbPromise;
}

module.exports = getDb;
