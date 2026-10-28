import { expect, it } from 'vitest';
import { isPrivateIp } from '@/lib/net';
it('ips', () => {
  for (const ip of ['::1', '::', '::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', 'fec0::1', 'fe80::1', 'fd00::1', '2002:7f00:1::', '10.0.0.1', '169.254.169.254']) expect(isPrivateIp(ip), ip).toBe(true);
  for (const ip of ['2606:4700::1111', '8.8.8.8', '::ffff:8.8.8.8', '2001:4860:4860::8888']) expect(isPrivateIp(ip), ip).toBe(false);
});
