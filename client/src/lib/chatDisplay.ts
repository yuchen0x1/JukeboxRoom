import type { ChatMessage } from '../types';

export type ChatDisplayRow = { msg: ChatMessage; repeatCount: number };

export function collapseAdjacentSystemEvents(messages: ChatMessage[]): ChatDisplayRow[] {
  const rows: ChatDisplayRow[] = [];
  for (const msg of messages) {
    const previous = rows[rows.length - 1];
    if (
      msg.kind === 'system'
      && previous?.msg.kind === 'system'
      && previous.msg.userId === msg.userId
      && previous.msg.text === msg.text
    ) {
      previous.repeatCount += 1;
      continue;
    }
    rows.push({ msg, repeatCount: 1 });
  }
  return rows;
}
