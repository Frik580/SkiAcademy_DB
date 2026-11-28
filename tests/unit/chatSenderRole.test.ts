import { describe, expect, it } from 'vitest';
import { resolveChatSenderRole } from '../../src/domain/chat';

describe('resolveChatSenderRole', () => {
  it('does not infer elevated roles from names and user IDs', () => {
    for (const name of ['admin', 'администратор', 'инструктор', 'Coach Alex']) {
      const message = { senderId: name, senderName: name, senderRole: undefined };
      expect(resolveChatSenderRole(message)).toBe('client');
    }
  });

  it('preserves the explicit role of a verified message', () => {
    expect(resolveChatSenderRole({ senderRole: 'instructor' })).toBe('instructor');
    expect(resolveChatSenderRole({ senderRole: 'admin' })).toBe('admin');
    expect(resolveChatSenderRole({ senderRole: 'client' })).toBe('client');
  });
});
