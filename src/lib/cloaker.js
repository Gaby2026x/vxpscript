const crypto = require('crypto');

// Attempt to load secret from config, otherwise use a safe default for development
let SECRET = 'change-this-secret-in-production-immediately';
try {
    const config = require('../config');
    if (config.redirector && config.redirector.secret) {
        SECRET = config.redirector.secret;
    }
} catch (e) { 
    // Config might not exist in all environments, ignore error
}

// ==================== PERFORMANCE FIX ====================
// CRITICAL OPTIMIZATION:
// We derive the key ONCE at startup and cache it.
// Previously, this was running on every single request, causing high CPU usage
// and multi-second delays for every click.
const CACHED_KEY = crypto.scryptSync(SECRET, 'salt', 32);

/**
 * Encrypts the destination URL so it's not visible in source code
 * Uses AES-256-GCM for authenticated encryption
 */
function encryptPayload(text) {
    const iv = crypto.randomBytes(16);
    
    // Use the cached key instead of deriving it again
    const cipher = crypto.createCipheriv('aes-256-gcm', CACHED_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
        content: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
    };
}

/**
 * Decrypts the payload server-side
 */
function decryptPayload(encryptedData) {
    try {
        // Use the cached key instead of deriving it again
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm', 
            CACHED_KEY, 
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (e) {
        return null;
    }
}

/**
 * Generate the "Invisible" Wrapper Page
 * This serves a blank page that immediately executes client-side bot checks. 
 * If passed, it performs a hidden POST submission to the unlock endpoint.
 */
exports.generateInvisibleWrapper = (finalUrl, linkId) => {
    // Encrypt the real URL so bots reading source code see garbage
    const encrypted = encryptPayload(finalUrl);
    
    // Embed the payload directly into the HTML
    // We escape backslashes and quotes to prevent JS syntax errors
    const payloadSafe = JSON.stringify(encrypted).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
<style>html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:#ffffff;}</style>
</head>
<body>
<script>
(function() {
    // Configuration embedded from server
    var P = JSON.parse("${payloadSafe}");
    var LID = "${linkId}";
    
    // --- SILENT BOT DETECTION ---
    // We check purely for mechanical signals that bots fail (Headless traits)
    // We do NOT do heavy math (Proof of Work) here because that causes visible delay.
    function isBot() {
        // Check 1: WebDriver is the most common flag for Selenium/Puppeteer
        if (navigator.webdriver) return true;
        
        // Check 2: PhantomJS properties
        if (window.callPhantom || window._phantom) return true;
        
        // Check 3: Headless Chrome often has 0 languages defined
        if (navigator.languages && navigator.languages.length === 0) return true;
        
        // Check 4: Plugin length (Headless often has 0) - Weak check, but useful in combo
        // We skip this for mobile as mobile often has 0 plugins too
        
        // Check 5: Canvas Fingerprinting (Lightweight)
        // Many bots cannot render canvas or return all zeros
        try {
            var c = document.createElement('canvas');
            var ctx = c.getContext('2d');
            if (!ctx) return true; // No graphics card = likely bot
            
            // Draw something simple
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125,1,62,20);
            ctx.fillStyle = "#069";
            ctx.fillText("BrowserCheck", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText("BrowserCheck", 4, 17);
            
            if (c.toDataURL().length < 100) return true; // Empty canvas
        } catch(e) { 
            return true; 
        }
        
        return false;
    }

    // --- EXECUTION ---
    // We wrap in a tiny timeout to ensure the browser environment is fully loaded
    setTimeout(function() {
        if (isBot()) {
            // FAIL: Silent redirect to fallback
            window.location.replace("https://www.google.com");
        } else {
            // PASS: Silent redirect to Real Destination
            // We use a POST request to a special endpoint that decrypts and redirects.
            // This keeps the final URL out of the source code until the very last second.
            
            var form = document.createElement('form');
            form.method = 'POST';
            form.action = '/tr/v2/unlock'; // The Unlock Endpoint
            form.style.display = 'none';
            
            var i1 = document.createElement('input');
            i1.type = 'hidden'; 
            i1.name = 'payload'; 
            i1.value = JSON.stringify(P);
            form.appendChild(i1);
            
            var i2 = document.createElement('input');
            i2.type = 'hidden'; 
            i2.name = 'lid'; 
            i2.value = LID;
            form.appendChild(i2);
            
            document.body.appendChild(form);
            form.submit();
        }
    }, 50);
})();
</script>
</body>
</html>`;
};

exports.encryptPayload = encryptPayload;
exports.decryptPayload = decryptPayload;
