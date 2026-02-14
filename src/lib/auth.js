const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const getDb = require('./database');

// Sign a new token
exports.sign = (payload) => {
    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
};

// Verify a token (middleware)
exports.verify = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // If no authorization header, we can't proceed with authentication.
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // For API routes, this is an error.
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the token
    jwt.verify(token, config.jwt.secret, (err, decodedPayload) => {
        if (err) {
            // e.g., 'TokenExpiredError', 'JsonWebTokenError'
            return res.status(403).json({ error: `Forbidden: ${err.message}` });
        }
        
        // THE FIX: Attach the decoded payload to the request object.
        req.user = decodedPayload;
        
        // Proceed to the next middleware or route handler.
        next();
    });
};

// Validate an access key — returns user object if valid, null otherwise
exports.validateAccessKey = async (key) => {
    const db = await getDb();
    const user = await db.get('SELECT id, username, role, accessKey, keyExpiresAt, isActive FROM users WHERE accessKey = ?', key);
    if (!user) return null;
    if (!user.isActive) return null;
    if (new Date(user.keyExpiresAt) < new Date()) return null;
    return { id: user.id, email: user.username, role: user.role };
};

// Generate an access key for a target email (admin only)
exports.generateAccessKey = async (requestorEmail, targetEmail) => {
    if (requestorEmail !== config.adminEmail) {
        throw new Error('Forbidden: Only the admin can generate access keys.');
    }
    const db = await getDb();
    const accessKey = crypto.randomBytes(32).toString('hex');
    const keyExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const role = targetEmail === config.adminEmail ? 'admin' : 'user';

    // Upsert: update if user exists, insert if not
    const existing = await db.get('SELECT id FROM users WHERE username = ?', targetEmail);
    if (existing) {
        await db.run(
            'UPDATE users SET accessKey = ?, keyExpiresAt = ?, isActive = 1, role = ? WHERE username = ?',
            [accessKey, keyExpiresAt, role, targetEmail]
        );
    } else {
        await db.run(
            'INSERT INTO users (username, accessKey, keyExpiresAt, isActive, role) VALUES (?, ?, ?, 1, ?)',
            [targetEmail, accessKey, keyExpiresAt, role]
        );
    }

    return { accessKey, expiresAt: keyExpiresAt };
};
