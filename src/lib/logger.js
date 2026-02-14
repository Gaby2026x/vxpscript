const chalk = require('chalk');

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || LOG_LEVELS.info;

const PREFIXES = {
    debug: chalk.gray('[DEBUG]'),
    info:  chalk.blue('[INFO]'),
    warn:  chalk.yellow('[WARN]'),
    error: chalk.red.bold('[ERROR]')
};

function formatMessage(level, module, message, meta) {
    const timestamp = new Date().toISOString();
    const prefix = PREFIXES[level] || '';
    const mod = module ? chalk.cyan(`[${module}]`) : '';
    const base = `${prefix} ${timestamp} ${mod} ${message}`;
    if (meta && Object.keys(meta).length > 0) {
        return `${base} ${chalk.gray(JSON.stringify(meta))}`;
    }
    return base;
}

function createLogger(module) {
    return {
        debug(message, meta) {
            if (currentLevel <= LOG_LEVELS.debug) {
                console.log(formatMessage('debug', module, message, meta));
            }
        },
        info(message, meta) {
            if (currentLevel <= LOG_LEVELS.info) {
                console.log(formatMessage('info', module, message, meta));
            }
        },
        warn(message, meta) {
            if (currentLevel <= LOG_LEVELS.warn) {
                console.warn(formatMessage('warn', module, message, meta));
            }
        },
        error(message, meta) {
            if (currentLevel <= LOG_LEVELS.error) {
                console.error(formatMessage('error', module, message, meta));
            }
        }
    };
}

module.exports = createLogger;
