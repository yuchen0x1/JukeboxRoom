
/**
 * Admin routes — initial skeleton.
 *
 * Exposes:
 * - GET  /api/admin/users         — list users (admin+)
 * - POST /api/admin/users/:id/ban — ban/unban user (admin+)
 * - GET  /api/admin/rooms         — list rooms
 * - POST /api/admin/rooms/:id     — force-close or announce in room
 * - GET  /api/admin/audit         — query audit logs (admin+)
 *
 * All routes require authentication + role check.
 * Routes are mounted under /api/admin/ with authMiddleware + requireRole.
 */

import { Router } from 'express';
import { all, findOne, update, find } from '../db/store.js';
import { queryAudit } from '../audit/index.js';
import { getRoomPublic, listRoomIds } from '../roomManager.js';

const router = Router();

function isPrivilegedRole(role) {
  return role === 'super_admin' || role === 'admin';
}

/* User management */
router.get('/users', (req, res) => {
  const users = all('users').map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    bannedAt: u.bannedAt,
  }));
  res.json({ users, total: users.length });
});

router.post('/users/:id/ban', (req, res) => {
  const { id } = req.params;
  const user = findOne('users', u => u.id === id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  if (user.id === req.user.id) {
    return res.status(403).json({ error: 'cannot_ban_self', message: '不能封禁自己' });
  }
  if (req.user.role !== 'super_admin' && isPrivilegedRole(user.role)) {
    return res.status(403).json({ error: 'forbidden', message: '仅超级管理员可封禁管理员' });
  }

  const newStatus = user.status === 'banned' ? 'active' : 'banned';
  update('users', u => u.id === id, {
    status: newStatus,
    bannedAt: newStatus === 'banned' ? new Date().toISOString() : null,
  });
  res.json({ id, status: newStatus });
});

/* Room management */
router.get('/rooms', (_req, res) => {
  const rooms = listRoomIds()
    .map((roomId) => getRoomPublic(roomId))
    .filter(Boolean);
  res.json({ rooms, total: rooms.length });
});

/* Audit log */
router.get('/audit', (req, res) => {
  const { actor, action, resource, result, limit } = req.query;
  const logs = queryAudit({ actor, action, resource, result, limit: limit ? parseInt(limit) : 100 });
  res.json({ auditLogs: logs, total: logs.length });
});

export { router as adminRouter };
