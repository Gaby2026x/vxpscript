const { body } = require('express-validator');

const accessKeyValidationRules = () => {
  return [
    body('accessKey', 'Access key is required')
        .trim()
        .notEmpty(),
  ];
};

const generateKeyValidationRules = () => {
  return [
    body('targetEmail', 'A valid email address is required')
        .trim()
        .isEmail()
        .normalizeEmail(),
  ];
};

module.exports = {
  accessKeyValidationRules,
  generateKeyValidationRules,
};
