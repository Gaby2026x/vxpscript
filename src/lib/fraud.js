const geoip = require('geoip-lite'); // Changed to geoip-lite as per typical setup, swap back to fast-geoip if needed
let config = {};

// Safe config loading
try {
    config = require('../config');
} catch (e) {
    // Default safe fraud settings if config missing
    config = {
        fraud: {
            datacenterAsn: [], // Add known bad ASNs here
            allowedCountries: [], // Empty means all allowed
            thresholds: { medium: 40, high: 80 }
        }
    };
}

const DATACENTER_ASN = new Set(config.fraud.datacenterAsn || []);

/**
 * Advanced Fraud Analysis
 * Evaluates Client Signals + Server Data
 */
async function analyze(req, body = {}) {
    const ip = req.clientIp || req.ip || '127.0.0.1';
    const clientSignals = body.s || {}; // Signals from client JS
    const details = [];
    let score = 0;
    
    // 1. IP & Geo Analysis
    const geo = geoip.lookup(ip);
    
    if (geo) {
        // Block Datacenters / Hosting Providers
        // (You would need a real ASN list for this to be effective)
        // Example check if you had ASN data:
        // if (DATACENTER_ASN.has(geo.asn)) { score += 100; details.push('Datacenter IP'); }
        
        // Country Allowlist
        if (config.fraud.allowedCountries && 
            config.fraud.allowedCountries.length > 0 && 
            !config.fraud.allowedCountries.includes(geo.country)) {
            score += 100; // Instant block
            details.push(`Country Block: ${geo.country}`);
        }
    }

    const userAgent = (req.headers['user-agent'] || '').toLowerCase();

    // 2. Explicit Bot Strings
    if (/bot|crawler|spider|scanner|curl|wget|python|java|headless/i.test(userAgent)) {
        score += 100;
        details.push('Bot User-Agent');
    }

    // 3. Client-Side Automation Detection (From JS)
    if (clientSignals.wd === true) {
        score += 100;
        details.push('Navigator.webdriver detected');
    }

    if (clientSignals.bot) {
        score += 100;
        details.push(`Automation detected (Type ${clientSignals.bot})`);
    }

    // 4. Mismatch Analysis (Advanced FUD)
    
    // Check 1: User Agent says Mac, but Platform says Win
    if (userAgent.includes('mac os') && clientSignals.pf && clientSignals.pf.toLowerCase().includes('win')) {
        score += 60;
        details.push('OS Mismatch');
    }

    // Check 2: Missing Canvas Fingerprint (Bots often fail to render canvas)
    if (!clientSignals.cv || clientSignals.cv.length < 50) {
        score += 40;
        details.push('Missing Canvas Fingerprint');
    }

    // Check 3: Headless Chrome often has 0 plugins
    if (userAgent.includes('chrome') && clientSignals.pl === 0 && !userAgent.includes('mobile')) {
        score += 30;
        details.push('Chrome with 0 Plugins (Suspicious)');
    }

    // 5. Timezone Check
    // If geo is US but timezone offset implies Asia/Europe
    if (geo && geo.country === 'US') {
        const offset = parseInt(clientSignals.tm);
        // US offsets are typically 240-600. If offset is negative (East), it's a proxy.
        if (offset < 240 || offset > 600) {
            // This is a loose check, be careful.
            // score += 20; 
            // details.push('Timezone/IP Mismatch potential');
        }
    }

    // Determine Risk Level
    let risk = 'low';
    if (score >= (config.fraud.thresholds.high || 80)) {
        risk = 'high';
    } else if (score >= (config.fraud.thresholds.medium || 40)) {
        risk = 'medium';
    }

    return { score, risk, details };
}

module.exports = analyze;
