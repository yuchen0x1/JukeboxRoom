/**
 * Shared playlist service tests (node --test)
 * Unit tests on core ops + HTTP integration with a fake auth middleware.
 */

import { test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { remove, all } from '../db/store.js';
import {
  playlistsRouter,
  createPlaylist,
  listVisiblePlaylists,
  addSong,
  removeSong,
  reorderSongs,
  addCollaborator,
  getPlaylist,
} from './index.js';

const COLLECTION = 'playlists';

const ALICE = { id: 'user-alice', username: 'alice', role: 'user' };
const BOB = { id: 'user-bob', username: 'bob', role: 'user' };
const CAROL = { id: 'user-carol', username: 'carol', role: 'user' };

function purge() {
  remove(COLLECTION, () => true);
  remove('audit_log', (e) => String(e.resource || '').startsWith('playlist:'));
}

let server;
let base;

function fakeAuth(user) {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}

function request(method, urlPath, { token, body } = {}) {
  const data = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = http.request(
      { host: '127.0.0.1', port: base, path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* ignore */ }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    if (data) req.write(data);
    req.end();
    req.on('error', reject);
  });
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/playlists', (req, res, next) => {
    // token header selects the fake user (only for tests)
    if (req.headers.authorization === 'Bearer alice') req.user = ALICE;
    else if (req.headers.authorization === 'Bearer bob') req.user = BOB;
    else if (req.headers.authorization === 'Bearer carol') req.user = CAROL;
    else req.user = null;
    next();
  }, playlistsRouter);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = server.address().port;
});

after(() => new Promise((r) => server.close(r)));

beforeEach(purge);
afterEach(purge);

/* ---------------- unit: core operations ---------------- */

test('createPlaylist requires a name and defaults to shared + version 1', () => {
  const bad = createPlaylist({ name: '   ', ownerId: ALICE.id, ownerName: ALICE.username });
  assert.equal(bad.error, 'name_required');

  const { playlist } = createPlaylist({ name: '深夜歌单', ownerId: ALICE.id, ownerName: ALICE.username });
  assert.equal(playlist.visibility, 'shared');
  assert.equal(playlist.version, 1);
  assert.deepEqual(playlist.songs, []);
  assert.deepEqual(playlist.collaborators, []);
});

test('listVisiblePlaylists honors visibility and collaboration', () => {
  createPlaylist({ name: '私享', visibility: 'private', ownerId: ALICE.id, ownerName: ALICE.username });
  createPlaylist({ name: '公开', visibility: 'public', ownerId: ALICE.id, ownerName: ALICE.username });
  createPlaylist({ name: '共享', visibility: 'shared', ownerId: ALICE.id, ownerName: ALICE.username });

  const forBob = listVisiblePlaylists({ id: BOB.id, role: BOB.role });
  assert.equal(forBob.length, 1);
  assert.equal(forBob[0].name, '公开');

  const forAlice = listVisiblePlaylists({ id: ALICE.id, role: ALICE.role });
  assert.equal(forAlice.length, 3);

  const shared = getPlaylist(forAlice.find((p) => p.name === '共享').id);
  addCollaborator(shared.id, BOB.id, ALICE.username);
  const forBob2 = listVisiblePlaylists({ id: BOB.id, role: BOB.role });
  assert.equal(forBob2.length, 2);
});

test('addSong / removeSong / reorderSongs bump version and keep song order', () => {
  const { playlist } = createPlaylist({ name: '歌单', ownerId: ALICE.id, ownerName: ALICE.username });
  const p1 = addSong(playlist.id, { id: 's1', title: 'A', artist: '甲' }, 'alice');
  const p2 = addSong(p1.playlist.id, { id: 's2', title: 'B', artist: '乙' }, 'alice', p1.playlist.version);
  assert.equal(p1.playlist.version, 2);
  assert.equal(p2.playlist.version, 3);
  assert.deepEqual(p2.playlist.songs.map((s) => s.id), ['s1', 's2']);

  const reordered = reorderSongs(playlist.id, ['s2', 's1'], p2.playlist.version);
  assert.deepEqual(reordered.playlist.songs.map((s) => s.id), ['s2', 's1']);

  const removed = removeSong(playlist.id, 's1', reordered.playlist.version);
  assert.deepEqual(removed.playlist.songs.map((s) => s.id), ['s2']);
  assert.equal(removed.playlist.version, 5);
});

test('stale baseVersion triggers version conflict (no write applied)', () => {
  const { playlist } = createPlaylist({ name: '歌单', ownerId: ALICE.id, ownerName: ALICE.username });
  addSong(playlist.id, { id: 's1', title: 'A' }, 'alice'); // version -> 2

  const stale = addSong(playlist.id, { id: 's2', title: 'B' }, 'alice', 1);
  assert.equal(stale.conflict, true);
  assert.equal(stale.currentVersion, 2);
  assert.equal(getPlaylist(playlist.id).songs.length, 1); // nothing added
});

/* ---------------- integration: HTTP + permissions ---------------- */

test('reorder rejects repeated IDs that would replace another song, without any write', async () => {
  const { playlist } = createPlaylist({ name: '保护歌单', ownerId: ALICE.id });
  addSong(playlist.id, { id: 'a', title: 'A' }, 'alice');
  addSong(playlist.id, { id: 'b', title: 'B' }, 'alice');
  const before = getPlaylist(playlist.id);
  const response = await request('POST', `/api/playlists/${playlist.id}/reorder`, {
    token: 'alice', body: { songIds: ['a', 'a'], baseVersion: before.version },
  });
  assert.equal(response.status, 400);
  assert.equal(response.json.error, 'song_ids_mismatch');
  assert.deepEqual(getPlaylist(playlist.id), before);
});

test('reorder preserves distinct legacy entries with the same ID and requires exact multiplicities', () => {
  const { playlist } = createPlaylist({ name: '多音源歌单', ownerId: ALICE.id });
  addSong(playlist.id, { id: 'same', title: '网易云版本', source: 'netease' }, 'alice');
  addSong(playlist.id, { id: 'same', title: 'QQ版本', source: 'tencent' }, 'alice');
  addSong(playlist.id, { id: 'other', title: '另一首' }, 'alice');
  const result = reorderSongs(playlist.id, ['same', 'other', 'same']);
  assert.deepEqual(result.playlist.songs.map((s) => s.title), ['网易云版本', '另一首', 'QQ版本']);
  const before = getPlaylist(playlist.id);
  assert.equal(reorderSongs(playlist.id, ['same', 'other', 'other']).error, 'song_ids_mismatch');
  assert.deepEqual(getPlaylist(playlist.id), before);
});

test('POST / creates a playlist, PATCH bumps version', async () => {
  const created = await request('POST', '/api/playlists', { token: 'alice', body: { name: '协作歌单', visibility: 'shared' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.version, 1);

  const patched = await request('PATCH', `/api/playlists/${created.json.id}`, { token: 'alice', body: { name: '协作歌单 V2', baseVersion: 1 } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.version, 2);
  assert.equal(patched.json.name, '协作歌单 V2');
});

test('PATCH with stale baseVersion returns 409 version_conflict', async () => {
  const created = await request('POST', '/api/playlists', { token: 'alice', body: { name: '歌单' } });
  await request('PATCH', `/api/playlists/${created.json.id}`, { token: 'alice', body: { description: 'x', baseVersion: 1 } });

  const conflict = await request('PATCH', `/api/playlists/${created.json.id}`, { token: 'alice', body: { name: '又改', baseVersion: 1 } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error, 'version_conflict');
  assert.equal(conflict.json.currentVersion, 2);
});

test('non-owner cannot edit or delete; collaborator can', async () => {
  const created = await request('POST', '/api/playlists', { token: 'alice', body: { name: '协作' } });
  const id = created.json.id;

  const bobEdit = await request('PATCH', `/${id}`.replace('/', '/api/playlists/'), { token: 'bob', body: { name: 'hack' } });
  assert.equal(bobEdit.status, 403);

  const bobDelete = await request('DELETE', `/api/playlists/${id}`, { token: 'bob' });
  assert.equal(bobDelete.status, 403);

  // alice adds bob as collaborator
  const collab = await request('POST', `/api/playlists/${id}/collaborators`, { token: 'alice', body: { userId: BOB.id } });
  assert.equal(collab.status, 200);
  assert.deepEqual(collab.json.collaborators, [BOB.id]);

  const bobAdd = await request('POST', `/api/playlists/${id}/songs`, { token: 'bob', body: { song: { id: 's1', title: 'B 加入', artist: '乙' } } });
  assert.equal(bobAdd.status, 201);
  assert.equal(bobAdd.json.songs.length, 1);

  // owner still cannot add self as collaborator (no-op error) and bob cannot add carol
  const selfCollab = await request('POST', `/api/playlists/${id}/collaborators`, { token: 'alice', body: { userId: ALICE.id } });
  assert.equal(selfCollab.status, 400);
  const bobCollab = await request('POST', `/api/playlists/${id}/collaborators`, { token: 'bob', body: { userId: CAROL.id } });
  assert.equal(bobCollab.status, 403);
});

test('GET list/detail visibility via HTTP', async () => {
  const priv = await request('POST', '/api/playlists', { token: 'alice', body: { name: '私有', visibility: 'private' } });
  const pub = await request('POST', '/api/playlists', { token: 'alice', body: { name: '公开', visibility: 'public' } });

  const bobList = await request('GET', '/api/playlists', { token: 'bob' });
  assert.equal(bobList.json.total, 1);
  assert.equal(bobList.json.playlists[0].id, pub.json.id);

  const bobDetail = await request('GET', `/api/playlists/${priv.json.id}`, { token: 'bob' });
  assert.equal(bobDetail.status, 403);

  const aliceDetail = await request('GET', `/api/playlists/${priv.json.id}`, { token: 'alice' });
  assert.equal(aliceDetail.status, 200);
});

test('reorder via HTTP validates song id set', async () => {
  const created = await request('POST', '/api/playlists', { token: 'alice', body: { name: '歌单' } });
  const id = created.json.id;
  const a = await request('POST', `/api/playlists/${id}/songs`, { token: 'alice', body: { song: { id: 's1', title: 'A' } } });
  await request('POST', `/api/playlists/${id}/songs`, { token: 'alice', body: { song: { id: 's2', title: 'B' } } });

  const bad = await request('POST', `/api/playlists/${id}/reorder`, { token: 'alice', body: { songIds: ['s1', 'nope'] } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'song_ids_mismatch');

  const ok = await request('POST', `/api/playlists/${id}/reorder`, { token: 'alice', body: { songIds: ['s2', 's1'] } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.songs.map((s) => s.id), ['s2', 's1']);
});

test('delete removes playlist for owner and 404 afterwards', async () => {
  const created = await request('POST', '/api/playlists', { token: 'alice', body: { name: '待删' } });
  const del = await request('DELETE', `/api/playlists/${created.json.id}`, { token: 'alice' });
  assert.equal(del.status, 200);
  const gone = await request('GET', `/api/playlists/${created.json.id}`, { token: 'alice' });
  assert.equal(gone.status, 404);
});
