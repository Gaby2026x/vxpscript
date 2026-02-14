const WebSocket = require('ws');
const chalk = require('chalk');
const oauth = require('./oauth'); 

let wss = null;
const clients = new Map(); // Map to store client metadata: { ws -> { userId: 123, ip: ... } }

/**
 * Initialize WebSocket server
 */
function init(server) {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        // Initialize client state
        clients.set(ws, { 
            userId: null, 
            ip: ip,
            connectedAt: Date.now() 
        });

        console.log(chalk.green(`[WS] Client connected from ${ip}`));

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                // Handle PING/PONG to keep connection alive
                if (data.type === 'PING') {
                    ws.send(JSON.stringify({ type: 'PONG' }));
                    return;
                }

                // Handle Authentication from app.js
                if (data.type === 'AUTH' && data.token) {
                    const user = oauth.verifyTokenString(data.token);
                    if (user) {
                        const clientData = clients.get(ws);
                        clientData.userId = user.id;
                        clientData.username = user.user;
                        clients.set(ws, clientData);
                        // console.log(chalk.blue(`[WS] Authenticated user: ${user.user}`));
                    }
                }
            } catch (e) {
                // Ignore malformed JSON
            }
        });

        ws.on('close', () => {
            clients.delete(ws);
            // console.log(chalk.yellow('[WS] Client disconnected'));
        });

        ws.on('error', (err) => {
            console.error(chalk.red('[WS] Error:'), err.message);
            clients.delete(ws);
        });
    });
}

/**
 * Broadcast message to specific User ID or everyone
 */
function broadcastToUser(userId, type, payload) {
    if (!wss) return;

    const message = JSON.stringify({ type, payload });

    wss.clients.forEach((client) => {
        const clientData = clients.get(client);
        
        // Broadcast if:
        // 1. Connection is OPEN
        // 2. Client is authenticated matches the target userId
        if (client.readyState === WebSocket.OPEN && clientData && clientData.userId === userId) {
            client.send(message);
        }
    });
}

/**
 * Middleware: Attach broadcast capability to the request object.
 * Updated to support targeted broadcasting via req.broadcastToUser
 */
function middleware(req, res, next) {
    // 1. General Broadcast (To All Connected - Use sparingly)
    req.broadcast = (message) => {
        if (!wss) return;
        const payload = JSON.stringify(message);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    };

    // 2. Targeted Broadcast (To Specific User - Best for Dashboard Feeds)
    req.broadcastToUser = (userId, type, payload) => {
        broadcastToUser(userId, type, payload);
    };

    // 3. Self Broadcast (Reply to the user who made the request)
    req.broadcastToSelf = (type, payload) => {
        if (req.user && req.user.id) {
            broadcastToUser(req.user.id, type, payload);
        }
    };

    next();
}

module.exports = {
    init,
    middleware,
    broadcastToUser
};
