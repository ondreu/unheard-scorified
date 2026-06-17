import { describe, expect, it } from 'vitest';
import {
  canBefriend,
  CHAT_CHANNELS,
  friendCounterpart,
  isChatChannel,
  isScopedChannel,
  isValidChatMessage,
  MAX_CHAT_MESSAGE_LENGTH,
  sanitizeChatMessage,
} from './social';

describe('social: friends', () => {
  it('friendCounterpart vrátí protistranu vztahu', () => {
    expect(friendCounterpart('a', 'a', 'b')).toBe('b');
    expect(friendCounterpart('b', 'a', 'b')).toBe('a');
  });

  it('friendCounterpart vrátí undefined, když self není stranou', () => {
    expect(friendCounterpart('c', 'a', 'b')).toBeUndefined();
  });

  it('canBefriend zakáže sám sebe, jinak povolí', () => {
    expect(canBefriend('a', 'a')).toBe(false);
    expect(canBefriend('a', 'b')).toBe(true);
    expect(canBefriend('a', '')).toBe(false);
  });
});

describe('social: chat', () => {
  it('global i guild jsou platné kanály, whisper není (neperzistovaný)', () => {
    expect(isChatChannel('global')).toBe(true);
    expect(isChatChannel('guild')).toBe(true);
    expect(isChatChannel('whisper')).toBe(false);
    expect(CHAT_CHANNELS).toContain('global');
    expect(CHAT_CHANNELS).toContain('guild');
  });

  it('guild je scoped kanál (vázaný na guildId), global ne', () => {
    expect(isScopedChannel('guild')).toBe(true);
    expect(isScopedChannel('global')).toBe(false);
  });

  it('sanitizeChatMessage ořeže a sjednotí bílé znaky', () => {
    expect(sanitizeChatMessage('  hello   world \n\t')).toBe('hello world');
    expect(sanitizeChatMessage('\n\n')).toBe('');
  });

  it('sanitizeChatMessage ořízne na max délku', () => {
    const long = 'x'.repeat(MAX_CHAT_MESSAGE_LENGTH + 50);
    expect(sanitizeChatMessage(long)).toHaveLength(MAX_CHAT_MESSAGE_LENGTH);
  });

  it('isValidChatMessage odmítne prázdné po normalizaci', () => {
    expect(isValidChatMessage('   ')).toBe(false);
    expect(isValidChatMessage('hi')).toBe(true);
  });
});
