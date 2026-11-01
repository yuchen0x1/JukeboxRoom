/**
 * 当前房间上下文：音源解析路由需要 roomId 才能动用该房间的房主凭据。
 * Room 页面挂载时写入，卸载时清空。
 */
let currentRoomId = '';

export function setCurrentRoomId(roomId: string): void {
  currentRoomId = (roomId || '').trim();
}

export function getCurrentRoomId(): string {
  return currentRoomId;
}
