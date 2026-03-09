const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const transport = isDev
    ? {
          target: 'pino-pretty',
          options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
          },
      }
    : undefined;

const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'info',
        transport,
    },
    pino.destination({ sync: false })
);

/**
 * Creates a child logger with a persistent context (e.g., handler name)
 * @param {string} context - The context name to include in all logs
 * @returns {pino.Logger} Child logger with context
 */
function createLogger(context) {
    return logger.child({ context });
}

module.exports = {
    logger,
    createLogger,
};
