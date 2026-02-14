const { body } = require('express-validator');

const createDomainValidationRules = () => {
  return [
    body('hostname', 'Hostname must be a valid fully-qualified domain name')
        .trim()
        .toLowerCase()
        .isFQDN()
        .withMessage('Please enter a valid domain (e.g., mysite.com)'),
  ];
};

module.exports = {
    createDomainValidationRules,
};
