import { randomBytes } from 'crypto';

const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function formatLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    pid: process.pid,
    ...meta,
  };
  return JSON.stringify(entry);
}

function createLogger(requestId) {
  const base = requestId ? { requestId } : {};
  function log(level, message, meta = {}) {
    const fn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : console.log;
    fn(formatLog(level, message, { ...base, ...meta }));
  }
  return {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    /** Return a child logger bound to a specific requestId */
    withRequestId: (rid) => createLogger(rid),
  };
}

/** Top-level logger with no requestId binding */
const rootLogger = createLogger();

export { rootLogger, createLogger };
