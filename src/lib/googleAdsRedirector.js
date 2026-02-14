const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const REDIRECT_SECRET = process.env.REDIRECT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

/**
 * FILE MIMICRY STRATEGY
 * Instead of looking like a tracking link (/tr/v1/...), 
 * we make the link look like a specific file resource (PDF, Invoice, Doc).
 * 
 * This keeps your domain "boring" to scanners but functional.
 */
exports.createRedirect = (safeUrl, publicDomain) => {
  const internalId = uuidv4();
  
  const signature = crypto.createHmac('sha256', REDIRECT_SECRET)
    .update(internalId)
    .digest('hex');

  let baseUrl = publicDomain;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
  }

  // Generate a random filename to mimic a legitimate document
  const fileNames = ['invoice', 'document', 'secure-view', 'verification', 'shipping-label', 'contract'];
  const extensions = ['pdf', 'html', 'php', 'view'];
  
  const randomName = fileNames[Math.floor(Math.random() * fileNames.length)];
  const randomExt = extensions[Math.floor(Math.random() * extensions.length)];
  const randomId = crypto.randomBytes(4).toString('hex');

  // The actual tracking route is /tr/v1/:id
  // But we will append query params that make it look like a file to the USER
  // Example: https://yourdomain.com/tr/v1/uuid?file=invoice_8293.pdf
  
  const visualParam = `file=${randomName}_${randomId}.${randomExt}`;
  
  // We use the standard route but add visual noise
  const finalLink = `${baseUrl}/tr/v1/${internalId}?s=${signature}&${visualParam}`;

  return {
    googleAdsUrl: finalLink, 
    internalId,
    signature
  };
};

exports.verifySignature = (id, signature) => {
  if (!id || !signature) return false;
  const expected = crypto.createHmac('sha256', REDIRECT_SECRET).update(id).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
};
