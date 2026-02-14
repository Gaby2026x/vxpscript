const { body } = require('express-validator');

const createLinkValidationRules = () => {
    return [
        body('rotations', 'Rotations must be a non-empty array').isArray({ min: 1 }),
        
        body('rotations.*.url', 'Each rotation must have a valid URL')
            .trim()
            .isURL({ require_protocol: true })
            .withMessage('Destination URL must start with http:// or https://'),
            
        body('rotations.*.weight', 'Weight must be a positive integer')
            .toInt()
            .isInt({ min: 1, max: 100 }),

        body('rotations.*.platform', 'Invalid platform specified')
            .optional()
            .isIn(['desktop', 'ios', 'android', 'windows', 'macos']),

        body('expiresAt', 'Expiration date must be a valid ISO 8601 date').isISO8601(),
        
        body('expiresAt').custom(value => {
            if (new Date(value) <= new Date()) {
                throw new Error('Expiration date must be in the future');
            }
            return true;
        }),
        
        body('customDomain', 'Custom domain must be a valid hostname')
            .optional({ checkFalsy: true })
            .trim()
            .isFQDN(),
    ];
};

// NEW: Validation for Short Links
const createShortLinkValidationRules = () => {
    return [
        body('targetUrl', 'Target URL must be a valid URL')
            .trim()
            .isURL({ require_protocol: true })
            .withMessage('Target URL must start with http:// or https://'),
            
        body('alias', 'Alias can only contain letters, numbers, and hyphens')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 3, max: 50 })
            .matches(/^[a-zA-Z0-9-_]+$/)
            .withMessage('Alias contains invalid characters'),
            
        body('title', 'Title must be less than 100 characters')
            .optional()
            .trim()
            .isLength({ max: 100 })
    ];
};

module.exports = {
    createLinkValidationRules,
    createShortLinkValidationRules
};
