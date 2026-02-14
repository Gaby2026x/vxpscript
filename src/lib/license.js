const config = require('../config');

// This is our "database" of valid license keys.
// Only keys in this object are considered valid.
const VALID_KEYS = {
  'DEMO-KEY': { plan: 'free' },
  'PRO-USER-123': { plan: 'pro' },
  'ENTERPRISE-XYZ': { plan: 'enterprise' }
};

// This object tracks usage for each key.
const usage = {};

// Reset usage every hour.
setInterval(() => {
    for (const key in usage) {
        delete usage[key];
    }
}, config.license.resetInterval);

/**
 * Checks if a license key is valid and if the user has not exceeded their usage limit.
 * @param {string} key - The license key provided by the user.
 * @returns {{ok: boolean, error?: string}}
 */
exports.check = (key) => {
    const license = VALID_KEYS[key];

    if (!license) {
        return { ok: false, error: 'Invalid license key' };
    }

    const plan = config.license.plans[license.plan];
    if (!plan) {
        return { ok: false, error: 'Internal error: Invalid plan configured.' };
    }

    // Initialize usage tracking for this key if it's the first time we've seen it.
    if (!usage[key]) {
        usage[key] = 0;
    }

    // Check if the user has exceeded their limit.
    if (usage[key] >= plan.limit) {
        return { ok: false, error: `Usage limit of ${plan.limit} for ${plan.name} plan exceeded.` };
    }

    // If everything is okay, increment the usage count.
    usage[key]++;

    return { ok: true };
};
