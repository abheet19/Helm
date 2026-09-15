import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 18088;
const base = `http://127.0.0.1:${port}`;
const revision = '0123456789abcdef0123456789abcdef01234567';

async function waitUntilReady() {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error('Helm did not start');
}

test('public API stays read-only, identifiable, and security-header protected', async () => {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      SOURCE_REVISION: revision,
      HELM_DISABLE_PROBES: '1',
    },
    stdio: 'ignore',
  });
  try {
    await waitUntilReady();
    const rootResponse = await fetch(base);
    assert.equal(rootResponse.status, 200);
    assert.match(rootResponse.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.equal(rootResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(rootResponse.headers.get('x-frame-options'), 'DENY');
    assert.match(rootResponse.headers.get('strict-transport-security') || '', /max-age=31536000/);
    assert.match(await rootResponse.text(), /<script src="\/theme-init\.js"><\/script>/);

    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.release_sha, revision);

    const fleetResponse = await fetch(`${base}/api/fleet`);
    assert.equal(fleetResponse.status, 200);
    assert.equal((await fleetResponse.json()).count, 7);

    const manifestResponse = await fetch(`${base}/mcp/manifest.json`);
    assert.equal(manifestResponse.status, 200);
    assert.equal((await manifestResponse.json()).tools.length, 4);

    const actionResponse = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'textify', action: 'deploy' }),
    });
    const action = await actionResponse.json();
    assert.equal(actionResponse.status, 200);
    assert.equal(action.dryRun, true);
    assert.equal(action.performed, false);
    assert.match(action.wouldRun, /^fly deploy --app /);

    assert.equal((await fetch(`${base}/api/health/not-a-project`)).status, 404);
    assert.equal(
      (
        await fetch(`${base}/api/action`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: 'textify', action: 'destroy' }),
        })
      ).status,
      400,
    );
  } finally {
    child.kill();
  }
});
