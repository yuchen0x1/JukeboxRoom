/**
 * Shared playlist service (P1-5).
 *
 * Features:
 * - CRUD: create / list / get / update meta / delete playlists
 * - 协作: owner can add/remove collaborators; collaborators can edit songs
 * - 版本冲突: optimistic-lock `version` on every content/meta change;
 *   pass body.baseVersion (the version the client last saw) — mismatch → 409
 * - Visibility: 'public' (anyone), 'shared' (owner + collaborators),
 *   'private' (owner only + admins)
 *
 * Persistence: JSON store (collection `playlists`), same upgrade path as the rest.
 *
 * HTTP API (mounted at /api/playlists, authMiddleware + requireRole user+):
 *   GET    /api/playlists                      -> visible list (compact)
 *   POST   /api/playlists                      { name, description?, visibility? }
 *   GET    /api/playlists/:id                  -> full detail (songs included)
 *   PATCH  /api/playlists/:id                  { name?, description?, visibility?, baseVersion? }
 *   DELETE /api/playlists/:id
 *   POST   /api/playlists/:id/songs            { song, baseVersion? }
 *   PATCH  /api/playlists/:id/songs/:songId    { title?, artist?, baseVersion? }
 *   DELETE /api/playlists/:id/songs/:songId    { baseVersion? }
 *   POST   /api/playlists/:id/reorder          { songIds: [...], baseVersion? }
 *   POST   /api/playlists/:id/collaborators    { userId }
 *   DELETE /api/playlists/:id/collaborators/:userId
 */

import { Router } from 'express';
import { insert, find, findOne, update, remove, all } from '../db/store.js';
import { recordAudit } from '../audit/index.js';

const COLLECTION = 'playlists';
const ADMIN_ROLES = ['super_admin', 'admin'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function canView(playlist, user) {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;
  if (playlist.ownerId === user.id) return true;
  if ((playlist.collaborators || []).includes(user.id)) return true;
  return playlist.visibility === 'public';
}

function canEdit(playlist, user) {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;
  if (playlist.ownerId === user.id) return true;
  return (playlist.collaborators || []).includes(user.id);
}

function isOwner(playlist, user) {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;
  return playlist.ownerId === user.id;
}

function checkVersion(playlist, baseVersion) {
  if (baseVersion === undefined || baseVersion === null) return { ok: true };
  if (Number(baseVersion) !== playlist.version) {
    return { conflict: true, currentVersion: playlist.version };
  }
  return { ok: true };
}

function saveVersion(playlist) {
  const next = { ...playlist, version: playlist.version + 1, updatedAt: now() };
  update(COLLECTION, (p) => p.id === playlist.id, { version: next.version, updatedAt: next.updatedAt });
  return next;
}

function compact(playlist, viewerId) {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    visibility: playlist.visibility,
    ownerId: playlist.ownerId,
    ownerName: playlist.ownerName,
    collaborators: playlist.collaborators || [],
    songCount: (playlist.songs || []).length,
    version: playlist.version,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
    isOwner: playlist.ownerId === viewerId,
    isCollaborator: (playlist.collaborators || []).includes(viewerId),
  };
}

function audit(actor, action, resource, after, result = 'success') {
  recordAudit({ actor, action, resource, after, result });
}

/* ------------------------------------------------------------------ */
/*  Core operations                                                    */
/* ------------------------------------------------------------------ */

function createPlaylist({ name, description = '', visibility = 'shared', ownerId, ownerName }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return { error: 'name_required' };
  const v = ['public', 'shared', 'private'].includes(visibility) ? visibility : 'shared';
  const playlist = insert(COLLECTION, {
    name: cleanName,
    description: String(description || ''),
    visibility: v,
    ownerId,
    ownerName: ownerName || '',
    collaborators: [],
    songs: [],
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  });
  return { playlist };
}

function listVisiblePlaylists({ id: userId, role }) {
  const viewer = { id: userId, role };
  return all(COLLECTION)
    .filter((p) => canView(p, viewer))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((p) => compact(p, userId));
}

function getPlaylist(id) {
  return findOne(COLLECTION, (p) => p.id === id) || null;
}

function updatePlaylistMeta(id, patch, baseVersion) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  const vc = checkVersion(playlist, baseVersion);
  if (vc.conflict) return { conflict: true, currentVersion: vc.currentVersion };

  const next = { ...playlist };
  if (patch.name !== undefined) {
    const clean = String(patch.name).trim();
    if (!clean) return { error: 'name_required' };
    next.name = clean;
  }
  if (patch.description !== undefined) next.description = String(patch.description);
  if (patch.visibility !== undefined) {
    if (!['public', 'shared', 'private'].includes(patch.visibility)) return { error: 'invalid_visibility' };
    next.visibility = patch.visibility;
  }
  const bumped = saveVersion(next);
  update(COLLECTION, (p) => p.id === id, { name: bumped.name, description: bumped.description, visibility: bumped.visibility });
  return { playlist: { ...playlist, ...bumped, name: bumped.name, description: bumped.description, visibility: bumped.visibility } };
}

function deletePlaylist(id) {
  const removed = remove(COLLECTION, (p) => p.id === id);
  return removed > 0;
}

function addSong(id, song, actor, baseVersion) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  const vc = checkVersion(playlist, baseVersion);
  if (vc.conflict) return { conflict: true, currentVersion: vc.currentVersion };
  if (!song || !String(song.id || '').trim()) return { error: 'song_id_required' };

  const entry = {
    id: String(song.id),
    title: String(song.title || '未知歌曲'),
    artist: String(song.artist || '未知艺术家'),
    source: String(song.source || 'pool'),
    addedBy: actor || '',
    addedAt: now(),
  };
  const next = saveVersion(playlist);
  const songs = [...playlist.songs, entry];
  update(COLLECTION, (p) => p.id === id, { songs });
  return { entry, playlist: { ...playlist, songs, version: next.version, updatedAt: next.updatedAt } };
}

function removeSong(id, songId, baseVersion) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  const vc = checkVersion(playlist, baseVersion);
  if (vc.conflict) return { conflict: true, currentVersion: vc.currentVersion };

  const idx = playlist.songs.findIndex((s) => s.id === songId);
  if (idx < 0) return { error: 'song_not_found' };
  const next = saveVersion(playlist);
  const songs = playlist.songs.filter((s) => s.id !== songId);
  update(COLLECTION, (p) => p.id === id, { songs });
  return { removed: true, playlist: { ...playlist, songs, version: next.version, updatedAt: next.updatedAt } };
}

function updateSongMeta(id, songId, patch, baseVersion) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  const vc = checkVersion(playlist, baseVersion);
  if (vc.conflict) return { conflict: true, currentVersion: vc.currentVersion };

  const idx = playlist.songs.findIndex((s) => s.id === songId);
  if (idx < 0) return { error: 'song_not_found' };
  const songs = playlist.songs.map((s) => (s.id === songId
    ? {
        ...s,
        title: patch.title !== undefined ? String(patch.title) : s.title,
        artist: patch.artist !== undefined ? String(patch.artist) : s.artist,
      }
    : s));
  const next = saveVersion(playlist);
  update(COLLECTION, (p) => p.id === id, { songs });
  return { playlist: { ...playlist, songs, version: next.version, updatedAt: next.updatedAt } };
}

function reorderSongs(id, songIds, baseVersion) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  const vc = checkVersion(playlist, baseVersion);
  if (vc.conflict) return { conflict: true, currentVersion: vc.currentVersion };
  if (!Array.isArray(songIds)) return { error: 'song_ids_required' };

  if (songIds.length !== playlist.songs.length) return { error: 'song_ids_mismatch' };
  // An exact permutation is required. Preserve older playlists containing the
  // same provider ID more than once instead of collapsing entries in a Map.
  const byId = new Map();
  for (const song of playlist.songs) {
    if (!byId.has(song.id)) byId.set(song.id, []);
    byId.get(song.id).push(song);
  }
  const songs = [];
  for (const sid of songIds) {
    const entries = byId.get(sid);
    if (!entries?.length) return { error: 'song_ids_mismatch' };
    songs.push(entries.shift());
  }
  const next = saveVersion(playlist);
  update(COLLECTION, (p) => p.id === id, { songs });
  return { playlist: { ...playlist, songs, version: next.version, updatedAt: next.updatedAt } };
}

function addCollaborator(id, userId, actor) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  if (!String(userId || '').trim()) return { error: 'user_id_required' };
  if (playlist.ownerId === userId) return { error: 'owner_already_collaborator' };
  if ((playlist.collaborators || []).includes(userId)) return { error: 'already_collaborator' };
  const collaborators = [...(playlist.collaborators || []), userId];
  update(COLLECTION, (p) => p.id === id, { collaborators, updatedAt: now() });
  audit(actor, 'playlist.collaborator_add', `playlist:${id}`, { userId });
  return { collaborators };
}

function removeCollaborator(id, userId, actor) {
  const playlist = getPlaylist(id);
  if (!playlist) return { error: 'not_found' };
  const collaborators = (playlist.collaborators || []).filter((u) => u !== userId);
  update(COLLECTION, (p) => p.id === id, { collaborators, updatedAt: now() });
  audit(actor, 'playlist.collaborator_remove', `playlist:${id}`, { userId });
  return { collaborators };
}

/* ------------------------------------------------------------------ */
/*  HTTP router (mounter applies authMiddleware + requireRole)         */
/* ------------------------------------------------------------------ */

const playlistsRouter = Router();

function deny(res) {
  return res.status(403).json({ error: 'forbidden' });
}

playlistsRouter.get('/', (req, res) => {
  const visible = listVisiblePlaylists(req.user);
  res.json({ playlists: visible, total: visible.length });
});

playlistsRouter.post('/', (req, res) => {
  const body = req.body || {};
  const result = createPlaylist({
    name: body.name,
    description: body.description,
    visibility: body.visibility,
    ownerId: req.user.id,
    ownerName: req.user.username,
  });
  if (result.error) return res.status(400).json({ error: result.error });
  audit(req.user.username || req.user.id, 'playlist.create', `playlist:${result.playlist.id}`, { name: result.playlist.name });
  res.status(201).json(result.playlist);
});

playlistsRouter.get('/:id', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!canView(playlist, req.user)) return deny(res);
  res.json(playlist);
});

playlistsRouter.patch('/:id', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!canEdit(playlist, req.user)) return deny(res);
  const body = req.body || {};
  const result = updatePlaylistMeta(req.params.id, body, body.baseVersion);
  if (result.conflict) return res.status(409).json({ error: 'version_conflict', currentVersion: result.currentVersion });
  if (result.error) return res.status(400).json({ error: result.error });
  audit(req.user.username || req.user.id, 'playlist.update', `playlist:${req.params.id}`, { version: result.playlist.version });
  res.json(result.playlist);
});

playlistsRouter.delete('/:id', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!isOwner(playlist, req.user)) return deny(res);
  deletePlaylist(req.params.id);
  audit(req.user.username || req.user.id, 'playlist.delete', `playlist:${req.params.id}`);
  res.json({ deleted: true });
});

playlistsRouter.post('/:id/songs', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!canEdit(playlist, req.user)) return deny(res);
  const body = req.body || {};
  const result = addSong(req.params.id, body.song, req.user.username || req.user.id, body.baseVersion);
  if (result.conflict) return res.status(409).json({ error: 'version_conflict', currentVersion: result.currentVersion });
  if (result.error) return res.status(400).json({ error: result.error });
  audit(req.user.username || req.user.id, 'playlist.song_add', `playlist:${req.params.id}`, { songId: result.entry.id });
  res.status(201).json(result.playlist);
});

playlistsRouter.patch('/:id/songs/:songId', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!canEdit(playlist, req.user)) return deny(res);
  const body = req.body || {};
  const result = updateSongMeta(req.params.id, req.params.songId, body, body.baseVersion);
  if (result.conflict) return res.status(409).json({ error: 'version_conflict', currentVersion: result.currentVersion });
  if (result.error) return res.status(400).json({ error: result.error });
  audit(req.user.username || req.user.id, 'playlist.song_update', `playlist:${req.params.id}`, { songId: req.params.songId });
  res.json(result.playlist);
});

playlistsRouter.delete('/:id/songs/:songId', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!canEdit(playlist, req.user)) return deny(res);
  const body = req.body || {};
  const result = removeSong(req.params.id, req.params.songId, body.baseVersion);
  if (result.conflict) return res.status(409).json({ error: 'version_conflict', currentVersion: result.currentVersion });
  if (result.error) return res.status(404).json({ error: result.error });
  audit(req.user.username || req.user.id, 'playlist.song_remove', `playlist:${req.params.id}`, { songId: req.params.songId });
  res.json(result.playlist);
});

playlistsRouter.post('/:id/reorder', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!canEdit(playlist, req.user)) return deny(res);
  const body = req.body || {};
  const result = reorderSongs(req.params.id, body.songIds, body.baseVersion);
  if (result.conflict) return res.status(409).json({ error: 'version_conflict', currentVersion: result.currentVersion });
  if (result.error) return res.status(400).json({ error: result.error });
  audit(req.user.username || req.user.id, 'playlist.reorder', `playlist:${req.params.id}`, { count: result.playlist.songs.length });
  res.json(result.playlist);
});

playlistsRouter.post('/:id/collaborators', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!isOwner(playlist, req.user)) return deny(res);
  const body = req.body || {};
  const result = addCollaborator(req.params.id, body.userId, req.user.username || req.user.id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

playlistsRouter.delete('/:id/collaborators/:userId', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (!isOwner(playlist, req.user)) return deny(res);
  const result = removeCollaborator(req.params.id, req.params.userId, req.user.username || req.user.id);
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

export {
  playlistsRouter,
  createPlaylist,
  listVisiblePlaylists,
  getPlaylist,
  updatePlaylistMeta,
  deletePlaylist,
  addSong,
  removeSong,
  updateSongMeta,
  reorderSongs,
  addCollaborator,
  removeCollaborator,
};
