const redis = require('redis');
const chalk = require('chalk');

let cache;
const useRedis = !!process.env.REDIS_URL;

if (useRedis) {
    // --- REDIS-BASED CACHE ---
    const client = redis.createClient({ url: process.env.REDIS_URL });

    client.on('error', (err) => console.error(chalk.red.bold('Redis Client Error'), err));
    client.on('connect', () => console.log(chalk.green('Connected to Redis server.')));
    client.connect();

    cache = {
        async get(key) {
            try {
                const value = await client.get(key);
                return value ? JSON.parse(value) : null;
            } catch (err) {
                return null;
            }
        },
        async set(key, value, options = {}) {
            try {
                const defaultOptions = { EX: 3600, ...options }; // 1-hour default expiration
                await client.set(key, JSON.stringify(value), defaultOptions);
            } catch (err) {
                console.error('Redis SET error:', err);
            }
        },
        async del(key) {
            try {
                await client.del(key);
            } catch (err) {
                console.error('Redis DEL error:', err);
            }
        },
        async quit() {
            if (client.isOpen) {
                await client.quit();
            }
        }
    };
    console.log(chalk.yellow('Cache strategy: Using Redis.'));

} else {
    // --- IN-MEMORY FALLBACK CACHE WITH TTL ---
    const memoryCache = new Map();

    // Periodic cleanup of expired entries (every 60 seconds)
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of memoryCache) {
            if (entry.expiresAt && now > entry.expiresAt) {
                memoryCache.delete(key);
            }
        }
    }, 60 * 1000);

    cache = {
        async get(key) {
            const entry = memoryCache.get(key);
            if (!entry) return null;
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                memoryCache.delete(key);
                return null;
            }
            return entry.value;
        },
        async set(key, value, options = {}) {
            const ttlSeconds = options.EX || 3600; // Default 1-hour TTL
            memoryCache.set(key, {
                value,
                expiresAt: Date.now() + (ttlSeconds * 1000)
            });
        },
        async del(key) {
            memoryCache.delete(key);
        },
        async quit() {
            memoryCache.clear();
        }
    };
    console.log(chalk.yellow('Cache strategy: Using in-memory fallback with TTL. No REDIS_URL found.'));
}

module.exports = cache;
