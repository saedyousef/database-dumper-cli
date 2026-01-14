import assert from 'node:assert';
import { test } from 'node:test';
import { BINARY_MAP, PINNED_MYSQL_VERSION, resolveBinaryDescriptor } from '../dist/versionMap.js';

test('resolveBinaryDescriptor finds linux x64 descriptor', () => {
  const descriptor = resolveBinaryDescriptor('linux', 'x64');
  assert.ok(descriptor, 'linux x64 descriptor should exist');
  assert.strictEqual(descriptor.platform, 'linux');
  assert.strictEqual(descriptor.arch, 'x64');
  assert.strictEqual(descriptor.version, PINNED_MYSQL_VERSION);
});

test('binary map entries share pinned version', () => {
  for (const entry of BINARY_MAP) {
    assert.strictEqual(entry.version, PINNED_MYSQL_VERSION, `entry for ${entry.platform}/${entry.arch} should use pinned version`);
  }
});

test('binary map contains linux, darwin, and win32 targets', () => {
  const platforms = new Set(BINARY_MAP.map((entry) => entry.platform));
  ['linux', 'darwin', 'win32'].forEach((platform) => assert.ok(platforms.has(platform), `missing ${platform} entries`));
});
