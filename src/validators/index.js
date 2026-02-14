const { validationResult } = require('express-validator');

// Middleware to handle validation errors from express-validator
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }
    
    // Extract errors into a cleaner format
    const extractedErrors = errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg
    }));

    // CRITICAL: Return a top-level 'error' string so the frontend displays it immediately
    const firstErrorMessage = extractedErrors[0].message;

    return res.status(422).json({
        success: false,
        error: firstErrorMessage, // Used by app.js toast/alerts
        errors: extractedErrors,  // Available for detailed field highlighting if needed
    });
};

module.exports = {
    validate,
};
