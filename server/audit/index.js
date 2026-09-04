
/**
 * Audit module — structured audit log.
 *
 * Records: actor, action, resource, before/after summary, IP, requestId, result.
 * Storage: server/db/store.js (JSON file, upgrade to PostgreSQL in Phase 2).
 */

import { insert, find, remove } from '../db/store.js';

const SENSITIVE_FIELDS = ['passwordHash', 'token', 'secret', 'authorization'];

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      clone[key] = '***REDACTED***';
    }
  }
  return clone;
}

/**
 * Record an audit entry.
 * @param {Object} params
 * @param {string} params.actor - userId or 'system' or deviceId
 * @param {string} params.action - e.g. 'user.login', 'room.close', 'admin.ban_user'
 * @param {string} params.resource - e.g. 'user:abc123', 'room:room_xyz'
 * @param {*} params.before - snapshot before (optional, auto-sanitized)
 * @param {*} params.after - snapshot after (optional, auto-sanitized)
 * @param {string} params.ip - source IP
 * @param {string} params.requestId - correlation ID
 * @param {string} params.result - 'success' | 'failure' | 'denied'
 */
function recordAudit({ actor, action, resource, before, after, ip, requestId, result = 'success' }) {
  const entry = {
    timestamp: new Date().toISOString(),
    actor,
    action,
    resource,
    before: before ? sanitize(before) : undefined,
    after: after ? sanitize(after) : undefined,
    ip: ip || '',
    requestId: requestId || '',
    result,
  };
  insert('audit_log', entry);
  return entry;
}

/** Query audit logs with optional filters */
function queryAudit({ actor, action, resource, result, limit = 100 } = {}) {
  let entries = find('audit_log', () => true);
  if (actor) entries = entries.filter(e => e.actor === actor);
  if (action) entries = entries.filter(e => e.action === action);
  if (resource) entries = entries.filter(e => e.resource === resource);
  if (result) entries = entries.filter(e => e.result === result);
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return entries.slice(0, limit);
}

/** Clean up old logs (older than retentionDays) */
function cleanupAuditLogs(retentionDays = 90) {
  const cutoff = Date.now() - retentionDays * 86400 * 1000;
  return remove('audit_log', e => new Date(e.timestamp).getTime() < cutoff);
}

export { recordAudit, queryAudit, cleanupAuditLogs };
