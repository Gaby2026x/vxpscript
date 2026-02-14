const { WebSocketServer } = require('ws');
const chalk = require('chalk');

function initializeWebSocket(server) {
    const wss = new WebSocketServer({ server });
    
    // Track connected clients with their user IDs for targeted broadcasts
    const clients = new Map();

    wss.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        
        clients.set(clientId, { ws, userId: null, connectedAt: Date.now() });
        console.log(chalk.gray(`[WS] Client ${clientId} connected from ${ip}. Total clients: ${clients.size}`));

        // Handle messages from client
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                
                if (data.type === 'AUTH' && data.userId) {
                    const client = clients.get(clientId);
                    if (client) {
                        client.userId = data.userId;
                        console.log(chalk.green(`[WS] Client ${clientId} authenticated as user ${data.userId}`));
                        
                        // Confirm authentication
                        ws.send(JSON.stringify({ 
                            type: 'AUTH_CONFIRMED', 
                            userId: data.userId,
                            timestamp: Date.now()
                        }));
                    }
                }
                
                if (data.type === 'PONG') {
                    const client = clients.get(clientId);
                    if (client) {
                        client.lastPong = Date.now();
                    }
                }
            } catch (err) {
                // Ignore parse errors
            }
        });

        ws.on('close', (code, reason) => {
            clients.delete(clientId);
            console.log(chalk.gray(`[WS] Client ${clientId} disconnected. Code: ${code}. Remaining: ${clients.size}`));
        });

        ws.on('error', (err) => {
            console.error(chalk.red(`[WS] Client ${clientId} error:`), err.message);
            clients.delete(clientId);
        });

        // Send connection confirmation
        ws.send(JSON.stringify({ 
            type: 'CONNECTED', 
            clientId,
            timestamp: Date.now()
        }));
    });

    /**
     * Enhanced broadcast function
     * @param {Object} data - Data to broadcast
     * @param {number|null} targetUserId - If specified, only send to this user's connections
     */
    const broadcast = (data, targetUserId = null) => {
        const message = JSON.stringify(data);
        let sentCount = 0;
        let targetedCount = 0;

        clients.forEach((client, clientId) => {
            if (client.ws.readyState === 1) { // WebSocket.OPEN = 1
                // If targetUserId specified, only send to that user
                // Otherwise broadcast to all authenticated clients
                const shouldSend = targetUserId === null || client.userId === targetUserId;
                
                if (shouldSend) {
                    try {
                        client.ws.send(message);
                        sentCount++;
                        if (targetUserId !== null) targetedCount++;
                    } catch (err) {
                        console.error(chalk.red(`[WS] Failed to send to ${clientId}:`), err.message);
                        clients.delete(clientId);
                    }
                }
            }
        });

        if (data.type === 'LIVE_CLICK') {
            const clickType = data.payload?.clickType || 'unknown';
            const linkId = data.payload?.linkId || 'unknown';
            console.log(chalk.cyan(`[WS] Broadcast LIVE_CLICK (${clickType}) for link ${linkId} to ${sentCount} client(s)`));
        }
    };

    // Heartbeat to keep connections alive and detect dead connections
    const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        
        clients.forEach((client, clientId) => {
            if (client.ws.readyState === 1) {
                // Check if client responded to last ping
                if (client.lastPing && !client.lastPong) {
                    // No pong received, connection might be dead
                    if (now - client.lastPing > 60000) {
                        console.log(chalk.yellow(`[WS] Terminating unresponsive client ${clientId}`));
                        client.ws.terminate();
                        clients.delete(clientId);
                        return;
                    }
                }
                
                // Send ping
                client.lastPing = now;
                client.ws.send(JSON.stringify({ type: 'PING', timestamp: now }));
            } else {
                // Clean up closed connections
                clients.delete(clientId);
            }
        });
    }, 30000); // Every 30 seconds

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
        console.log(chalk.yellow('[WS] WebSocket server closed'));
    });

    console.log(chalk.green('[WS] WebSocket Server Initialized with Enhanced Tracking'));
    
    // Return broadcast function
    return broadcast;
}

module.exports = initializeWebSocket;
