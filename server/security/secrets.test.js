import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MIN_SECRET_LENGTH,
  SECRETS_FILE,
  resolveSecrets,
  secretsPath,
  validateSecret,
} from './secrets.js';

function strongSecret(seed) {
  return `${seed}-${'x'.repeat(MIN_SECRET_LENGTH)}`;
}

test('production requires both strong, non-placeholder secrets', () => {
  assert.throws(
    () => resolveSecrets({ env: { NODE_ENV: 'production' }, dataDir: path.join(os.tmpdir(), `jukebox-secrets-${Date.now()}`) }),
    /CLIENT_ID_SECRET.*AUTH_JWT_SECRET/,
  );
  assert.throws(
    () => resolveSecrets({
      env: {
        NODE_ENV: 'production',
        CLIENT_ID_SECRET: 'change-this-to-a-long-random-secret-value',
        AUTH_JWT_SECRET: strongSecret('jwt'),
      },
      dataDir: path.join(os.tmpdir(), `jukebox-secrets-${Date.now()}-placeholder`),
    }),
    /CLIENT_ID_SECRET/,
  );
  assert.equal(validateSecret('CLIENT_ID_SECRET', 'short').reason, 'too_short');
  assert.equal(validateSecret('AUTH_JWT_SECRET', 'a'.repeat(MIN_SECRET_LENGTH)).reason, 'placeholder');
});

test('non-production fallback secrets persist and remain stable', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-secrets-'));
  try {
    const first = resolveSecrets({ env: { NODE_ENV: 'development' }, dataDir });
    const second = resolveSecrets({ env: { NODE_ENV: 'development' }, dataDir });
    assert.deepEqual(second, first);
    assert.equal(fs.existsSync(secretsPath(dataDir)), true);
    assert.deepEqual(
      Object.keys(JSON.parse(fs.readFileSync(path.join(dataDir, SECRETS_FILE), 'utf8'))).sort(),
      ['AUTH_JWT_SECRET', 'CLIENT_ID_SECRET'],
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('explicit non-production secrets take precedence without replacing persisted fallback', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-secrets-'));
  const configured = {
    NODE_ENV: 'test',
    CLIENT_ID_SECRET: strongSecret('client'),
    AUTH_JWT_SECRET: strongSecret('jwt'),
  };
  try {
    const resolved = resolveSecrets({ env: configured, dataDir });
    assert.deepEqual(resolved, {
      CLIENT_ID_SECRET: configured.CLIENT_ID_SECRET,
      AUTH_JWT_SECRET: configured.AUTH_JWT_SECRET,
    });
    assert.equal(fs.existsSync(secretsPath(dataDir)), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
