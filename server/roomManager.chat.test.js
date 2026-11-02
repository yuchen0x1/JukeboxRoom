import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { addToQueue, addUser, closeRoomManager, createRoom } from './roomManager.js';

test('new song requests carry a safe structured chat payload', async () => {
  const created = createRoom({ name: 'structured-chat-room', creatorId: 'owner' });
  addUser(created.id, 'owner', '房主');
  addUser(created.id, 'listener', '听众');

  const result = await addToQueue(created.id, {
    id: 'song-42',
    source: 'netease',
    name: '示例歌曲',
    artist: '示例歌手',
    album: '示例专辑',
    pic: 'https://music.example/cover.jpg',
    duration: 210,
    url: 'https://music.example/audio.mp3',
    lrc: '[00:00]歌词内容',
  }, { id: 'listener', nickname: '听众' });

  assert.equal(result.error, undefined);
  assert.equal(result.systemMessage.kind, 'song_request');
  assert.equal(result.systemMessage.userId, 'listener');
  assert.equal(result.systemMessage.nickname, '听众');
  assert.deepEqual(result.systemMessage.song, {
    id: 'song-42',
    source: 'netease',
    name: '示例歌曲',
    artist: '示例歌手',
    album: '示例专辑',
    pic: 'https://music.example/cover.jpg',
    duration: 210,
  });
  assert.equal('url' in result.systemMessage.song, false);
  assert.equal('lrc' in result.systemMessage.song, false);
});

after(async () => {
  await closeRoomManager();
});
