/**
 * Local streaming service tests (node --test)
 * Spins a real express server on an ephemeral port and verifies
 * Range/ETag/206/304/416 behavior plus the path guard.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import http from 'http';
import { runScan } from './index.js';
import { resolveLibraryFilePath, buildEtag } from './stream.js';
import { remove, all, insert } from '../db/store.js';

const FILE_SIZE = 10000;
let tmpDir;
let server;
let base;
let song;

const savedLibraryPaths = process.env.MUSIC_LIBRARY_PATHS;

function request(method, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: base.split(':').pop(), path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-lib-'));
  // deterministic binary file
  const buf = Buffer.alloc(FILE_SIZE);
  for (let i = 0; i < FILE_SIZE; i++) buf[i] = i % 256;
  fs.writeFileSync(path.join(tmpDir, '测试 歌曲.mp3'), buf);

  process.env.MUSIC_LIBRARY_PATHS = tmpDir;
  const scan = runScan([tmpDir]);
  assert.equal(scan.added, 1);

  const app = express();
  app.use('/api/library', (await import('./index.js')).libraryRouter);
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  base = `http://127.0.0.1:${port}`;

  song = all('library_songs').find(s => s.filePath && s.filePath.startsWith(tmpDir));
});

after(() => {
  process.env.MUSIC_LIBRARY_PATHS = savedLibraryPaths;
  remove('library_songs', s => s.filePath && s.filePath.startsWith(tmpDir));
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  if (server) server.close();
});

test('full GET returns 200 with length, type, accept-ranges, etag', async () => {
  const r = await request('GET', `/api/library/stream/${song.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.length, FILE_SIZE);
  assert.equal(r.headers['content-type'], 'audio/mpeg');
  assert.equal(r.headers['accept-ranges'], 'bytes');
  assert.ok(r.headers.etag);
  assert.equal(r.headers['content-length'], String(FILE_SIZE));
});

test('byte range returns 206 with correct content-range and slice', async () => {
  const r = await request('GET', `/api/library/stream/${song.id}`, { Range: 'bytes=0-99' });
  assert.equal(r.status, 206);
  assert.equal(r.headers['content-range'], `bytes 0-99/${FILE_SIZE}`);
  assert.equal(r.body.length, 100);
});

test('suffix range returns last N bytes', async () => {
  const r = await request('GET', `/api/library/stream/${song.id}`, { Range: 'bytes=-50' });
  assert.equal(r.status, 206);
  assert.equal(r.headers['content-range'], `bytes ${FILE_SIZE - 50}-${FILE_SIZE - 1}/${FILE_SIZE}`);
  assert.equal(r.body.length, 50);
  // last byte pattern: (FILE_SIZE-1) % 256
  assert.equal(r.body[49], (FILE_SIZE - 1) % 256);
});

test('If-None-Match with matching etag returns 304', async () => {
  const full = await request('GET', `/api/library/stream/${song.id}`);
  const etag = full.headers.etag;
  const r = await request('GET', `/api/library/stream/${song.id}`, { 'If-None-Match': etag });
  assert.equal(r.status, 304);
});

test('unsatisfiable range returns 416 with bytes range hint', async () => {
  const r = await request('GET', `/api/library/stream/${song.id}`, { Range: 'bytes=20000-' });
  assert.equal(r.status, 416);
  assert.equal(r.headers['content-range'], `bytes */${FILE_SIZE}`);
});

test('unknown song id returns 404', async () => {
  const r = await request('GET', '/api/library/stream/does-not-exist');
  assert.equal(r.status, 404);
});

test('path guard rejects files outside library roots', () => {
  const outside = path.join(os.tmpdir(), `om-lib-outside-${Date.now()}.mp3`);
  fs.writeFileSync(outside, Buffer.from('outside'));
  try {
    assert.equal(resolveLibraryFilePath(path.join(tmpDir, '测试 歌曲.mp3')).startsWith(tmpDir), true);
    assert.equal(resolveLibraryFilePath(path.join(tmpDir, 'sub', '..', '测试 歌曲.mp3')).startsWith(tmpDir), true);
    assert.equal(resolveLibraryFilePath(outside), '');
    assert.throws(() => resolveLibraryFilePath('C:\\Windows\\System32\\win.ini'));
  } finally {
    fs.rmSync(outside, { force: true });
  }
});

test('stream route rejects symlinks that resolve outside library roots', async () => {
  const outside = path.join(os.tmpdir(), `om-lib-outside-${Date.now()}.mp3`);
  const linkPath = path.join(tmpDir, 'linked-outside.mp3');
  fs.writeFileSync(outside, Buffer.from('not in library'));
  try {
    try {
      fs.symlinkSync(outside, linkPath);
    } catch (err) {
      if (err.code === 'EPERM') return;
      throw err;
    }
    const record = insert('library_songs', {
      title: 'Linked outside',
      artist: 'Test',
      album: 'Test',
      source: 'local',
      filePath: linkPath,
      fileName: path.basename(linkPath),
    });
    const response = await request('GET', `/api/library/stream/${record.id}`);
    assert.equal(response.status, 403);
  } finally {
    remove('library_songs', s => s.filePath === linkPath);
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('etag is stable for same file and differs by content', () => {
  const statA = fs.statSync(path.join(tmpDir, '测试 歌曲.mp3'));
  const statB = fs.statSync(path.join(tmpDir, '测试 歌曲.mp3'));
  assert.equal(buildEtag(statA), buildEtag(statB));
});
