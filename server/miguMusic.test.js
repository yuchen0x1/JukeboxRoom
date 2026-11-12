import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMiguSongId, encodeMiguSongId } from './miguMusic.js';

test('migu song ids preserve content and copyright ids', () => {
  const id = encodeMiguSongId('600902000006889366', '60054701923');
  assert.equal(id, '600902000006889366|60054701923');
  assert.deepEqual(decodeMiguSongId(id), {
    contentId: '600902000006889366',
    copyrightId: '60054701923',
  });
});

test('migu song ids reject malformed or oversized values', () => {
  assert.throws(() => decodeMiguSongId('only-content'), /歌曲标识无效/);
  assert.throws(() => encodeMiguSongId('bad|id', 'copyright'), /歌曲标识无效/);
});
