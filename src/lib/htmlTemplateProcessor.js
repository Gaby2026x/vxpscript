/**
 * HTML Template Processor v12.2 (The "Nuclear" Option + Hardened)
 * 
 * MISSION:
 * Render untrusted/obfuscated HTML templates while guaranteeing ZERO client-side redirects.
 * 
 * STRATEGY:
 * 1. Recursive De-obfuscation: Unpack nested Base64/Hex layers to expose the core logic.
 * 2. Static Sanitization: Regex-kill known redirect patterns in the raw string.
 * 3. RUNTIME SUPER-FREEZER: Inject a high-priority script that overwrites the browser's 
 *    navigation capabilities AND TIMERS to prevent state changes (white pages).
 * 
 * This ensures the server.js logic is the ONLY authority on redirection.
 */

const { v4: uuidv4 } = require('uuid');

// ==================== CONFIGURATION ====================
const SUPPORTED_TOKENS = {
    '%%DESTINATION_URL%%': 'destinationUrl',
    '%%RAY_ID%%': 'rayId',
    '%%TIMESTAMP%%': 'timestamp',
    '%%LINK_ID%%': 'linkId',
    '%%COUNTRY%%': 'country',
    '%%DOMAIN%%': 'domain'
};

const REDIRECT_KEYWORDS = [
    'location',
    'redirect',
    'refresh',
    'navigate',
    'window.open',
    'history.pushstate',
    'history.replacestate',
    'javascript:',
    'meta http-equiv',
    'http-equiv=refresh',
    'window.location',
    'document.location',
    'top.location'
];

const REDIRECT_SCHEMES = [
    'javascript:',
    'vbscript:',
    'data:text/html',
    'data:text/javascript'
];

/**
 * Interactive Captcha HTML
 * Triggers the server unlock mechanism.
 */
const INTERACTIVE_CAPTCHA_HTML = `
<div class="system-captcha-wrapper" style="margin: 20px auto; display: table;">
    <div id="demo-captcha" style="width: 300px; height: 74px; background: #f9f9f9; border: 1px solid #d3d3d3; border-radius: 3px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; font-family: Roboto, sans-serif; box-shadow: 0 0 4px 1px rgba(0,0,0,0.08); cursor: pointer; user-select: none;">
        <div style="display: flex; align-items: center;">
            <div id="captcha-checkbox" style="width: 24px; height: 24px; border: 2px solid #c1c1c1; border-radius: 2px; background: #fff; margin-right: 12px; display: flex; align-items: center; justify-content: center;">
                <div id="captcha-check" style="width: 14px; height: 14px; background: #4CAF50; display: none;"></div>
            </div>
            <span id="captcha-text" style="font-size: 14px; color: #000;">I'm not a robot</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center;">
            <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" style="width: 32px; height: 32px; opacity: 0.6;">
            <div style="font-size: 10px; color: #555; margin-top: 2px;">reCAPTCHA</div>
            <div style="font-size: 8px; color: #555;">Privacy - Terms</div>
        </div>
    </div>
</div>
<script>
(function() {
    var c = document.getElementById('demo-captcha');
    var b = document.getElementById('captcha-checkbox');
    var k = document.getElementById('captcha-check');
    var clicked = false;
    if(c){
        c.onclick = function(e) {
            if(clicked) return;
            clicked = true;
            e.preventDefault();
            e.stopPropagation();
            b.style.borderColor = 'transparent';
            k.style.display = 'block';
            k.style.width = '100%';
            k.style.height = '100%';
            k.style.background = 'none';
            k.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#0F9D58" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
            
            // Dispatch event for server.js unlocker
            document.dispatchEvent(new CustomEvent('captcha-verified'));
        };
    }
})();
</script>
`;

/**
 * The "Nuclear Freezer" Script.
 * This script is injected at the very top of the document.
 * It aggressively neuters any capability the browser has to navigate away.
 * 
 * UPDATE: Added a hidden backdoor (__sys_ops) so our System Unlock script can 
 * bypass this freeze when legitimate unlock occurs.
 * 
 * CRITICAL UPDATE: Timers (setTimeout/setInterval) are now COMPLETELY DISABLED.
 * This prevents templates from running "hide content" or "show loading" animations
 * that cause the white page effect before redirect.
 */
const NUCLEAR_FREEZER_SCRIPT = `
<script data-security="nuclear-freezer">
(function() {
    'use strict';
    
    // BACKDOOR for System Unlocker
    // We create a sealed object to hold the original navigation methods
    // This allows the server-injected unlock script to perform the final redirect
    // while blocking everything else in the template.
    var sysOps = {
        replace: window.location.replace.bind(window.location),
        assign: window.location.assign.bind(window.location)
    };
    Object.defineProperty(window, '__sys_ops', {
        value: sysOps,
        writable: false,
        configurable: false,
        enumerable: false
    });

    console.log("☢️ NUCLEAR FREEZER ACTIVATED: Redirects & Timers neutralized.");

    function containsRedirectKeyword(input) {
        if (!input) return false;
        var s = String(input).toLowerCase();
        return ${JSON.stringify(REDIRECT_KEYWORDS)}.some(function(k) { return s.indexOf(k) !== -1; });
    }

    function sanitizeHtmlSnippet(input) {
        try {
            var s = String(input);
            s = s.replace(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, '');
            s = s.replace(/\\s(?:href|src|action|formaction)\\s*=\\s*["']\\s*javascript:[^"']*["']/gi, ' href="#"');
            s = s.replace(/on\\w+\\s*=\\s*(["'])[\\s\\S]*?\\1/gi, function(match) {
                return containsRedirectKeyword(match) ? '' : match;
            });
            return s;
        } catch(e) {
            return input;
        }
    }

    // 1. LOOP BREAKER: Detect rapid refreshes and kill the process
    try {
        var key = 'ref_count_' + window.location.pathname;
        var now = Date.now();
        var last = parseInt(sessionStorage.getItem(key + '_time') || 0);
        var count = parseInt(sessionStorage.getItem(key) || 0);
        
        if (now - last < 2000) { // If refreshed within 2 seconds
            count++;
        } else {
            count = 1;
        }
        
        sessionStorage.setItem(key, count);
        sessionStorage.setItem(key + '_time', now);
        
        if (count > 3) {
            console.warn("Loop detected. FORCE STOPPING.");
            window.stop(); // Kill all loading
            throw new Error("Execution halted due to loop detection.");
        }
    } catch(e) {}

    // 2. BLACK HOLE: Define a dummy location object
    function killNavigation() {
        try {
            var noop = function() { console.log("Blocked navigation attempt."); return false; };
            window.location.replace = noop;
            window.location.assign = noop;
            window.location.reload = noop;
            Object.defineProperty(window.location, 'href', {
                get: function() { return window.location.origin + window.location.pathname; },
                set: function(val) { console.log("Blocked href assignment to: " + val); }
            });
        } catch(e) {}
    }
    killNavigation();

    // 3. TIMER KILLER: Completely disable setTimeout/setInterval
    // This prevents the template from running logic that hides body content 
    // or shows "loading" spinners (white pages) before our redirect happens.
    window.setTimeout = function() { console.log("Blocked setTimeout - UI Frozen"); return -1; };
    window.setInterval = function() { console.log("Blocked setInterval - UI Frozen"); return -1; };

    // 4. EVAL / FUNCTION SHADOWING
    var originalEval = window.eval;
    window.eval = function(code) {
        console.log("Blocked eval()");
        return null;
    };

    // 5. WINDOW.OPEN BLOCKER
    window.open = function() { console.log("Blocked window.open"); return null; };

    // 6. HISTORY API LOCK
    if (window.history) {
        window.history.pushState = function() {};
        window.history.replaceState = function() {};
    }

    // 7. EVENT KILLER (onbeforeunload)
    window.onbeforeunload = null;

    // 8. Block document.write from injecting redirects
    try {
        var originalWrite = document.write;
        var originalWriteln = document.writeln;
        document.write = function() {
            var args = Array.prototype.slice.call(arguments).map(sanitizeHtmlSnippet);
            return originalWrite.apply(document, args);
        };
        document.writeln = function() {
            var args = Array.prototype.slice.call(arguments).map(sanitizeHtmlSnippet);
            return originalWriteln.apply(document, args);
        };
    } catch(e) {}

    // 9. Purge meta refresh if inserted dynamically
    function purgeRefreshMeta(root) {
        try {
            var scope = root || document;
            var metas = scope.querySelectorAll('meta[http-equiv="refresh" i]');
            metas.forEach(function(m) { m.parentNode && m.parentNode.removeChild(m); });
        } catch(e) {}
    }

    try {
        purgeRefreshMeta(document);
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes && m.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) purgeRefreshMeta(node);
                });
            });
        });
        observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch(e) {}

})();
</script>
`;

/**
 * Main Processing Function
 */
function processTemplate(rawInput, options = {}) {
    const {
        destinationUrl,
        linkId = 'preview',
        country = 'Unknown',
        domain = 'localhost'
    } = options;

    if (!rawInput || typeof rawInput !== 'string') {
        return { html: getDefaultTemplate(), sanitizationReport: { error: 'No input provided' } };
    }

    const report = {
        extracted: null,
        decodedBase64: false,
        sanitized: false,
        neutralizedCount: 0,
        strippedScripts: 0,
        strippedHandlers: 0,
        strippedUrls: 0,
        strippedMeta: 0,
        strippedBase: 0
    };

    let html = rawInput;

    // --- STEP 1: RECURSIVE DE-OBFUSCATION ---
    let iterations = 0;
    const MAX_ITERATIONS = 8;
    let foundPattern = true;

    while (foundPattern && iterations < MAX_ITERATIONS) {
        const result = extractFromObfuscatedPatterns(html);
        if (result) {
            html = result.html;
            report.decodedBase64 = true;
            report.extracted = result.method;
            iterations++;
        } else {
            foundPattern = false;
        }
    }

    // --- STEP 2: STATIC NEUTRALIZATION (Regex) ---
    const neutralizationResult = neutralizeRedirects(html);
    html = neutralizationResult.html;
    report.neutralizedCount += neutralizationResult.count;

    // --- STEP 2A: STRIP META REFRESH / BASE TAGS ---
    const metaResult = stripMetaRefreshAndBase(html);
    html = metaResult.html;
    report.neutralizedCount += metaResult.count;
    report.strippedMeta += metaResult.metaCount;
    report.strippedBase += metaResult.baseCount;

    // --- STEP 2B: STRIP SCRIPTS / INLINE HANDLERS / JS URLS ---
    const scriptResult = sanitizeScriptBlocks(html);
    html = scriptResult.html;
    report.neutralizedCount += scriptResult.count;
    report.strippedScripts += scriptResult.strippedScripts;

    const handlerResult = stripInlineEventHandlers(html);
    html = handlerResult.html;
    report.neutralizedCount += handlerResult.count;
    report.strippedHandlers += handlerResult.count;

    const urlResult = stripJavascriptUrls(html);
    html = urlResult.html;
    report.neutralizedCount += urlResult.count;
    report.strippedUrls += urlResult.count;

    const schemeResult = stripRedirectSchemes(html);
    html = schemeResult.html;
    report.neutralizedCount += schemeResult.count;
    report.strippedUrls += schemeResult.count;

    // --- STEP 3: CAPTCHA INJECTION ---
    html = replaceCaptchasWithInteractive(html);

    // --- STEP 4: TOKEN REPLACEMENT ---
    const tokenValues = {
        destinationUrl: '#',
        linkId,
        country,
        domain,
        rayId: uuidv4().replace(/-/g, '').substring(0, 16),
        timestamp: Date.now().toString()
    };
    for (const [token, key] of Object.entries(SUPPORTED_TOKENS)) {
        const regex = new RegExp(token, 'g');
        html = html.replace(regex, tokenValues[key] || '');
    }

    // --- STEP 5: INJECT NUCLEAR FREEZER ---
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com; child-src 'none'; object-src 'none';">`;
    const headerInjection = cspTag + NUCLEAR_FREEZER_SCRIPT;

    if (html.toLowerCase().includes('<head>')) {
        html = html.replace(/<head>/i, '<head>' + headerInjection);
    } else if (html.toLowerCase().includes('<html>')) {
        html = html.replace(/<html>/i, '<html><head>' + headerInjection + '</head>');
    } else {
        html = headerInjection + html;
    }

    return {
        html: html,
        sanitizationReport: report
    };
}

/**
 * Extract HTML from obfuscated patterns
 */
function extractFromObfuscatedPatterns(input) {
    const cleanInput = input.replace(/[\r\n]+/g, ' ');

    // 1. Standard atob() wrapper
    const atobPattern = /(?:document\.write|eval|setTimeout)\s*\(\s*(?:decodeURIComponent\s*\(\s*)?atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)(?:\s*\))?(?:\s*\))?\s*\)/i;
    let match = atobPattern.exec(cleanInput);
    if (match && match[1]) {
        try {
            const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
            let decodedUri = decoded;
            try { decodedUri = decodeURIComponent(decoded); } catch (e) {}
            return { html: decodedUri, method: 'Decoded Base64 (atob)' };
        } catch (e) { }
    }

    // 2. Hex/Unescape wrapper
    const unescapePattern = /(?:document\.write|eval)\s*\(\s*unescape\s*\(\s*["']([^"']+)["']\s*\)\s*\)/i;
    match = unescapePattern.exec(cleanInput);
    if (match && match[1]) {
        try {
            const decoded = decodeURIComponent(match[1]);
            return { html: decoded, method: 'Decoded Unescape' };
        } catch (e) { }
    }

    // 3. Raw base64 block detection
    const base64Only = cleanInput.trim();
    if (/^[A-Za-z0-9+/=]{80,}$/.test(base64Only)) {
        try {
            const decoded = Buffer.from(base64Only, 'base64').toString('utf-8');
            if (decoded.includes('<html') || decoded.includes('<script') || decoded.includes('<body')) {
                return { html: decoded, method: 'Decoded Raw Base64' };
            }
        } catch (e) { }
    }

    return null;
}

/**
 * Static Regex Neutralizer
 */
function neutralizeRedirects(html) {
    let clean = html;
    let count = 0;

    const patterns = [
        { regex: /<meta\s+http-equiv=["']?refresh["']?[^>]*>/gi, replace: '<!-- meta refresh blocked -->' },
        { regex: /window\.location\s*=/gi, replace: 'var blocked_loc =' },
        { regex: /document\.location\s*=/gi, replace: 'var blocked_doc_loc =' },
        { regex: /location\.href\s*=/gi, replace: 'var blocked_href =' },
        { regex: /location\s*\[\s*['"]href['"]\s*\]\s*=/gi, replace: 'var blocked_href =' },
        { regex: /location\s*\[\s*['"]assign['"]\s*\]\s*\(/gi, replace: 'console.log(' },
        { regex: /location\s*\[\s*['"]replace['"]\s*\]\s*\(/gi, replace: 'console.log(' },
        { regex: /location\s*\[\s*['"]reload['"]\s*\]\s*\(/gi, replace: 'console.log(' },
        { regex: /location\.replace\s*\(/gi, replace: 'console.log(' },
        { regex: /location\.assign\s*\(/gi, replace: 'console.log(' },
        { regex: /location\.reload\s*\(/gi, replace: 'console.log(' },
        { regex: /window\.navigate\s*\(/gi, replace: 'console.log(' },
        { regex: /window\.open\s*\(/gi, replace: 'console.log(' },
        { regex: /history\.pushState\s*\(/gi, replace: 'console.log(' },
        { regex: /history\.replaceState\s*\(/gi, replace: 'console.log(' },
        { regex: /top\.location\s*=/gi, replace: 'var blocked_top =' },
        { regex: /top\.location\.href\s*=/gi, replace: 'var blocked_top_href =' },
        { regex: /var\s+redirect\s*=/gi, replace: 'var blocked_redirect =' },
        { regex: /window\.location\.href/gi, replace: 'window.location.origin' }
    ];

    patterns.forEach(p => {
        if (clean.search(p.regex) !== -1) {
            clean = clean.replace(p.regex, p.replace);
            count++;
        }
    });

    if (clean.includes('integrity=')) {
        clean = clean.replace(/integrity=["'][^"']*["']/gi, '');
        count++;
    }

    return { html: clean, count };
}

/**
 * Strip Meta Refresh and Base Tags
 */
function stripMetaRefreshAndBase(html) {
    let count = 0;
    let metaCount = 0;
    let baseCount = 0;

    let clean = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?\s*refresh\s*["']?[^>]*>/gi, () => {
        count++;
        metaCount++;
        return '<!-- meta refresh blocked -->';
    });

    clean = clean.replace(/<link[^>]*rel\s*=\s*["']?\s*refresh\s*["']?[^>]*>/gi, () => {
        count++;
        metaCount++;
        return '<!-- link refresh blocked -->';
    });

    clean = clean.replace(/<base\s+[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi, () => {
        count++;
        baseCount++;
        return '<!-- base href blocked -->';
    });

    return { html: clean, count, metaCount, baseCount };
}

/**
 * Script Sanitizer
 */
function sanitizeScriptBlocks(html) {
    let count = 0;
    let strippedScripts = 0;

    const cleaned = html.replace(/<script\b([^>]*)>([\s\S]*?)\.<\/script>/gi, (match, attrs, code) => {
        const result = neutralizeRedirectsInScript(code);
        count += result.count;
        if (!result.code.trim()) {
            strippedScripts++;
            return `<script${attrs}></script>`;
        }
        return `<script${attrs}>${result.code}</script>`;
    });

    return { html: cleaned, count, strippedScripts };
}

function neutralizeRedirectsInScript(code) {
    let output = code;
    let count = 0;

    const patterns = [
        { regex: /(window|document|top|self|parent)\s*\.\s*location\s*=\s*[^;]+;?/gi, replace: '/* blocked location assignment */' },
        { regex: /(^|[^\w$])location\s*=\s*[^;]+;?/gi, replace: '$1/* blocked location assignment */' },
        { regex: /location\s*\.\s*href\s*=\s*[^;]+;?/gi, replace: '/* blocked location.href assignment */' },
        { regex: /location\s*\[\s*['"]href['"]\s*\]\s*=\s*[^;]+;?/gi, replace: '/* blocked location[href] assignment */' },
        { regex: /location\s*\.\s*(assign|replace|reload)\s*\(/gi, replace: '/* blocked location.$1 */(' },
        { regex: /location\s*\[\s*['"](assign|replace|reload)['"]\s*\]\s*\(/gi, replace: '/* blocked location.$1 */(' },
        { regex: /window\.open\s*\(/gi, replace: '/* blocked window.open */(' },
        { regex: /history\.(pushState|replaceState)\s*\(/gi, replace: '/* blocked history.$1 */(' },
        { regex: /setTimeout\s*\(\s*['"][^'"]*(location|href|replace|assign|reload|open|navigate|refresh)[^'"]*['"]/gi, replace: 'setTimeout(function(){}' },
        { regex: /setInterval\s*\(\s*['"][^'"]*(location|href|replace|assign|reload|open|navigate|refresh)[^'"]*['"]/gi, replace: 'setInterval(function(){}' }
    ];

    patterns.forEach(p => {
        if (p.regex.test(output)) {
            output = output.replace(p.regex, p.replace);
            count++;
        }
    });

    return { code: output, count };
}

/**
 * Strip Inline Event Handlers
 */
function stripInlineEventHandlers(html) {
    let count = 0;
    const cleaned = html.replace(/\son\w+\s*=\s*(["'])([\s\S]*?)\1/gi, (match, quote, code) => {
        const lower = (code || '').toLowerCase();
        if (REDIRECT_KEYWORDS.some(k => lower.includes(k))) {
            count++;
            return '';
        }
        return match;
    });
    return { html: cleaned, count };
}

/**
 * Strip javascript: URLs
 */
function stripJavascriptUrls(html) {
    let count = 0;
    const cleaned = html.replace(/\s(href|src|action|formaction)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, (match, attr, quote) => {
        count++;
        return ` ${attr}=${quote}#${quote}`;
    });
    return { html: cleaned, count };
}

/**
 * Strip redirect schemes in URLs
 */
function stripRedirectSchemes(html) {
    let count = 0;
    const cleaned = html.replace(/\s(href|src|action|formaction)\s*=\s*(["'])([^"']*)\2/gi, (match, attr, quote, value) => {
        const lower = (value || '').trim().toLowerCase();
        if (REDIRECT_SCHEMES.some(s => lower.startsWith(s))) {
            count++;
            return ` ${attr}=${quote}#${quote}`;
        }
        return match;
    });
    return { html: cleaned, count };
}

/**
 * Replace Captchas
 */
function replaceCaptchasWithInteractive(html) {
    return html.replace(/<div[^>]*class\s*=\s*["'][^"']*\b(h-captcha|g-recaptcha|cf-turnstile)\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, INTERACTIVE_CAPTCHA_HTML);
}

/**
 * Validate Template
 */
function validateTemplate(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') return { isValid: false, errors: ['HTML required'] };
    const warnings = [];
    if (/atob\s*\(/.test(htmlContent)) warnings.push('Obfuscated content detected. We will unpack it.');
    if (/<meta\s+http-equiv=["']refresh/i.test(htmlContent)) warnings.push('Meta refresh detected (will be blocked).');
    return { isValid: true, errors: [], warnings };
}

/**
 * Default Template
 */
function getDefaultTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Check</title>
    <style>
        body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
        h2 { margin-top: 0; color: #333; }
        p { color: #666; margin-bottom: 1.5rem; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Security Check</h2>
        <p>Please complete the check below to proceed.</p>
        ${INTERACTIVE_CAPTCHA_HTML}
    </div>
</body>
</html>`;
}

module.exports = {
    processTemplate,
    validateTemplate,
    getDefaultTemplate,
    SUPPORTED_TOKENS
};
