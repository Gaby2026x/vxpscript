const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const requestIp = require('request-ip');
const config = require('../config');
const requestContext = require('../lib/request-context');

/**
 * Robust Context Middleware
 * Captures User, IP, Request ID, and Trace Data for every request.
 * Essential for the new "Invisible Wrapper" and "Fraud Analysis" systems.
 */
function contextMiddleware(req, res, next) {
    // 1. Generate Unique Request ID (Trace ID)
    // This helps track a visitor from the initial hit -> invisible wrapper -> unlock POST
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.requestId = requestId; // Attach to req for easy access
    res.setHeader('X-Request-ID', requestId); // Send back to client for debugging

    // 2. Resolve Client IP Robustly
    // Uses the same logic as the rest of the app to ensure consistency in logs
    const clientIp = requestIp.getClientIp(req);
    
    // 3. Initialize Context Data
    const contextData = {
        requestId,
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'unknown',
        user: null // Default to null (unauthenticated)
    };

    // 4. Handle Authentication (JWT)
    const authHeader = req.headers.authorization;
    
    // Helper to proceed with context
    const runNext = () => {
        requestContext.run(contextData, next);
    };

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return runNext(); // Proceed as unauthenticated
    }

    const token = authHeader.split(' ')[1];
    
    // Robust Secret Handling: Fallback if config is missing (prevents crash during startup)
    const secret = (config.jwt && config.jwt.secret) 
        ? config.jwt.secret 
        : process.env.JWT_SECRET || 'change-this-in-production';

    jwt.verify(token, secret, (err, decodedUser) => {
        if (!err && decodedUser) {
            // Token is valid - attach user to context
            contextData.user = decodedUser;
            
            // Also attach to req.user for legacy/standard Express compatibility
            req.user = decodedUser;
        } else {
            // Token invalid/expired - Log it but don't crash, proceed as guest
            // This is important for the tracking routes which might receive stale tokens
            if (process.env.NODE_ENV === 'development') {
                console.warn(`[AUTH] Invalid token on ${req.path}: ${err ? err.message : 'Unknown error'}`);
            }
        }
        
        // Execute the next middleware inside the AsyncLocalStorage context
        runNext();
    });
}

module.exports = contextMiddleware;
