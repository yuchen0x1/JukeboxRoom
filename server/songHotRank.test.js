import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordSongRequest,
  getHotSongs,
  resetMemoryHotRank,
  memoryHotRankSize,
} from './songHotRank.js';

/**
 * 内存热榜必须自带上限（Redis 分支有 trimHotRank，内存分支原先没有）。
 * 否则任意房间成员持续点新歌就能让 Map 无界增长，且每次读取都全量排序。
 */

function waitForRank() {
  // recordSongRequest 在无 Redis 时同步写入内存，这里只让出一次事件循环。
  return new Promise((resolve) => setImmediate(resolve));
}

test('内存热榜保有 200 条上限，且保留热度更高的歌曲', async () => {
  resetMemoryHotRank();

  // 先把一首歌刷到 count=3，它不应在后续淘汰中被移除
  for (let i = 0; i < 3; i += 1) {
    recordSongRequest({ id: 'hot', name: '热门歌曲', source: 'netease' });
  }

  for (let i = 0; i < 260; i += 1) {
    recordSongRequest({ id: `song-${i}`, name: `歌曲 ${i}`, source: 'netease' });
  }
  await waitForRank();

  assert.equal(memoryHotRankSize(), 200, '内存热榜应被裁剪到 200 条');

  const songs = await getHotSongs(5);
  assert.equal(songs[0]?.id, 'hot', '高热度歌曲应排在第一');
  assert.equal(songs[0]?.count, 3);
});

test('重复点同一首歌只累加计数，不新增条目', async () => {
  resetMemoryHotRank();
  for (let i = 0; i < 5; i += 1) {
    recordSongRequest({ id: 'same', name: '同一首歌', source: 'netease' });
  }
  await waitForRank();

  assert.equal(memoryHotRankSize(), 1);
  const songs = await getHotSongs(10);
  assert.equal(songs.length, 1);
  assert.equal(songs[0].count, 5);
});

test('缺少 id 或名称的请求不进入热榜', async () => {
  resetMemoryHotRank();
  recordSongRequest({ name: '没有 id', source: 'netease' });
  recordSongRequest({ id: 'no-name', source: 'netease' });
  recordSongRequest(null);
  await waitForRank();

  assert.equal(memoryHotRankSize(), 0);
});
