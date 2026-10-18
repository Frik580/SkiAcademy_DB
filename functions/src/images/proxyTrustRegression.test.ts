import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const proxyaddr = require('proxy-addr') as {
  compile: (subnet: string) => (address: string) => boolean;
};
describe('proxy-addr mapped subnet security regression', () => {
  it('does not trust arbitrary IPv4 addresses through a zero-prefix IPv6 subnet', () => {
    expect(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.1')).toBe(false);
    expect(proxyaddr.compile('::/1')('203.0.113.1')).toBe(false);
    expect(proxyaddr.compile('::ffff:10.0.0.0/104')('10.1.2.3')).toBe(true);
    expect(proxyaddr.compile('::ffff:10.0.0.0/104')('203.0.113.1')).toBe(false);
  });
});
