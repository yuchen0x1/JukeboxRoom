import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { all, remove } from '../db/store.js';
import { extractBasicMetadata, runScanAsync, startLibraryWatcher, stopLibraryWatcher } from './index.js';

test('本地曲库保留文件名回退元数据并支持异步增量扫描清理', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmusic-library-'));
  const filePath = path.join(tempDir, '测试歌手 - 测试歌曲.mp3');
  fs.writeFileSync(filePath, Buffer.from('not-a-real-mp3'));
  const fallback = extractBasicMetadata(filePath);
  const before = all('library_songs').filter((song) => song.filePath === filePath);
  try {
    const first = await runScanAsync([tempDir]);
    assert.equal(first.added, before.length ? 0 : 1);
    const song = all('library_songs').find((item) => item.filePath === filePath);
    assert.equal(song.title, fallback.title);
    assert.equal(song.artist, fallback.artist);

    const unchanged = await runScanAsync([tempDir]);
    assert.equal(unchanged.added, 0);
    assert.equal(unchanged.updated, 0);

    fs.rmSync(filePath);
    const second = await runScanAsync([tempDir]);
    assert.equal(second.removed, 1);
    assert.equal(all('library_songs').find((item) => item.filePath === filePath).deletedAt !== undefined, true);

    fs.writeFileSync(filePath, Buffer.from('not-a-real-mp3-again'));
    const third = await runScanAsync([tempDir]);
    assert.equal(third.updated, 1);
    assert.equal(all('library_songs').find((item) => item.filePath === filePath).deletedAt, undefined);
  } finally {
    remove('library_songs', (song) => song.filePath === filePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('本地曲库监听器在新增文件后触发防抖扫描', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmusic-library-watch-'));
  const filePath = path.join(tempDir, '监听歌手 - 新歌曲.mp3');
  let result;
  try {
    const watcher = startLibraryWatcher([tempDir], { debounceMs: 100, onScan: (next) => { result = next; } });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('等待曲库监听器 ready 超时')), 5000);
      watcher.once('ready', () => { clearTimeout(timeout); resolve(); });
      watcher.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
    fs.writeFileSync(filePath, Buffer.from('not-a-real-mp3'));
    const deadline = Date.now() + 8000;
    while (!result && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(result?.added, 1);
    assert.equal(all('library_songs').some((song) => song.filePath === filePath && !song.deletedAt), true);
  } finally {
    stopLibraryWatcher();
    remove('library_songs', (song) => song.filePath === filePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
