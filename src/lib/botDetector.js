/**
 * Bot Detector v3.0 (Enhanced)
 * Sophisticated detection using UA patterns, Headers, and Heuristics.
 */

// Comprehensive list of bot/crawler/scanner signatures
const BOT_PATTERNS = [
    // Generic
    'bot', 'crawler', 'spider', 'scraper', 'checker', 'monitor', 'agent',
    // Tools & Libraries
    'curl', 'wget', 'python', 'java', 'axios', 'got', 'node-fetch', 'guzzle', 'libwww', 
    'http_client', 'postman', 'insomnia', 'headless', 'phantom', 'selenium', 'puppeteer', 
    'playwright', 'webdriver', 'chrome-lighthouse', 'gtmetrix', 'pingdom',
    // Search Engines & Social
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot', 'discordbot',
    'whatsapp', 'telegrambot', 'pinterest', 'tumblr', 'skypeuripreview',
    // Security Scanners
    'virus', 'virustotal', 'avast', 'kaspersky', 'mcafee', 'symantec', 'norton',
    'zscaler', 'paloalto', 'fortinet', 'barracuda', 'cyvelle',
    // Cloud/Hosting specific (generic tokens often found in cloud IPs UAs)
    'amazonaws', 'azure', 'google-cloud'
];

function detectBot(req, clientSignals = {}) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    let score = 0;
    const reasons = [];

    // ====== Layer 1: User-Agent Signature Analysis ======
    
    // 1. Empty or malformed User-Agent (Immediate high risk)
    if (!ua || ua === '' || ua.length < 10) {
        score += 85;
        reasons.push('Empty/Short UA');
    }

    // 2. Pattern Matching
    for (const pattern of BOT_PATTERNS) {
        if (ua.includes(pattern)) {
            score += 100; // Immediate Block
            reasons.push(`Signature matched: ${pattern}`);
            break; // Stop checking if we found a match
        }
    }

    // ====== Layer 2: HTTP Headers Analysis ======

    // 1. Missing Standard Browser Headers
    // Real browsers usually send Accept, Accept-Language, and Accept-Encoding
    if (!req.headers['accept-language']) {
        score += 40;
        reasons.push('Missing Accept-Language');
    }
    
    if (!req.headers['accept']) {
        score += 25;
        reasons.push('Missing Accept header');
    }

    // 2. Pragma/Cache-Control behavior (Bots often force no-cache)
    if (req.headers['pragma'] === 'no-cache' || req.headers['cache-control'] === 'no-cache') {
        // Only suspicious if combined with other signals, so small score
        score += 10; 
    }

    // ====== Layer 3: Client Signals (If available) ======
    // These signals come from the JavaScript executed on the frontend
    if (clientSignals && typeof clientSignals === 'object') {
        
        // WebDriver is the "smoking gun" for automation
        if (clientSignals.webdriver === true || clientSignals.webdriver === 'true') {
            score += 100;
            reasons.push('WebDriver detected (Client-side)');
        }

        // Headless Chrome check
        if (clientSignals.headless === true) {
            score += 100;
            reasons.push('Headless Browser detected');
        }

        // Human Signals (Reduces score)
        if (clientSignals.jsExecuted === true) {
            score -= 20; // JavaScript works, so it's a browser of some sort
        }

        if (clientSignals.hasInteraction === true) {
            score -= 30; // Mouse moved/Clicked, likely human
        }
    }

    // ====== Layer 4: Heuristics ======
    // Linux without Android often indicates a server/headless linux bot
    if (ua.includes('linux') && !ua.includes('android') && !ua.includes('x11')) {
         score += 30;
         reasons.push('Suspicious OS (Linux non-Android)');
    }

    // Normalize score
    score = Math.max(0, Math.min(100, score));
    
    // Strict thresholds for "Sophisticated" blocking
    // Any score >= 50 is treated as a bot
    const isBot = score >= 50;
    
    const confidence = score >= 80 ? 'high' : (score >= 50 ? 'medium' : 'low');

    return {
        isBot,
        score,
        confidence,
        signals: reasons
    };
}

module.exports = detectBot;
