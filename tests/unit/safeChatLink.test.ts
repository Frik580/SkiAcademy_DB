import { describe, expect, it } from 'vitest';
import { safeChatLink } from '../../src/features/chat/safeChatLink';

describe('CA-SEC-06A chat attachment link guard', () => {
  it.each(['https://example.com/material', 'http://example.com/a?b=1#c'])(
    'keeps absolute http(s) link %s',
    (value) => {
      expect(safeChatLink(value)).toBe(new URL(value).href);
    }
  );

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://app.example/1234',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    '/relative/path',
    'chat-media:chat/thread/photo.jpg',
    '',
    'not a url',
  ])('refuses non-http(s) attachment value %s', (value) => {
    expect(safeChatLink(value)).toBeUndefined();
  });

  it.each([undefined, null, 42, {}, ['https://example.com']])(
    'refuses non-string attachment value %s',
    (value) => {
      expect(safeChatLink(value)).toBeUndefined();
    }
  );
});
