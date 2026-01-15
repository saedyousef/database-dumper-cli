import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig, upsertDatabase, deleteDatabase, SCHEMA_VERSION } from '../dist/configStore.js';

test('config store persists databases and honors schema version', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'db-dumper-cli-test-'));
  const configPath = path.join(tempDir, 'config.json');

  const initial = await loadConfig(configPath);
  assert.strictEqual(initial.version, SCHEMA_VERSION);
  assert.strictEqual(initial.databases.length, 0);

  const now = new Date().toISOString();
  const entry = {
    id: 'database-test-entry',
    dbType: 'mysql',
    environment: 'test',
    name: 'sample-db',
    host: 'localhost',
    username: 'root',
    passwordRef: 'password-ref',
    selectedFlags: [],
    createdAt: now,
    updatedAt: now,
  };

  upsertDatabase(initial, entry);
  await saveConfig(initial, configPath);

  const saved = await loadConfig(configPath);
  assert.strictEqual(saved.databases.length, 1);
  assert.strictEqual(saved.databases[0].id, entry.id);
  assert.strictEqual(saved.databases[0].environment, entry.environment);

  deleteDatabase(saved, entry.id);
  await saveConfig(saved, configPath);

  const afterDelete = await loadConfig(configPath);
  assert.strictEqual(afterDelete.databases.length, 0);
});
