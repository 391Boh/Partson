import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

let reads = 0;
let writes = 0;
let releaseOldRead;
let notifyOldRead;
const oldReadStarted = new Promise(resolve => { notifyOldRead = resolve; });
const server = http.createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url.endsWith('/allgoods')) {
      reads++;
      if (reads === 1) {
        releaseOldRead = () => response.end(JSON.stringify({ quantity: 5 }));
        notifyOldRead();
      } else response.end(JSON.stringify({ quantity: 8 }));
    } else {
      writes++;
      if (request.url.endsWith('/fail')) response.statusCode = 503;
      // Keep equal movements overlapping to exercise request deduplication.
      setTimeout(() => response.end(JSON.stringify({ success: true })), 30);
    }
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const savedEnv = { ...process.env };
process.env.ONEC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ONEC_AUTH_HEADER = 'test-only';
process.env.ONEC_DEV_DISK_CACHE = '0';
const source = readFileSync(new URL('../app/api/_lib/oneC.js', import.meta.url), 'utf8');
const { oneCRequest, clearAllOneCCache } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

try {
  const options = { method: 'POST', body: { Код: 'TEST' }, retries: 0, timeoutMs: 1000, cacheTtlMs: 60000 };
  const oldRead = oneCRequest('allgoods', options);
  await oldReadStarted;
  clearAllOneCCache();
  const current = await oneCRequest('allgoods', options);
  assert.equal(JSON.parse(current.text).quantity, 8, 'Post-edit read must not join a pre-edit request');
  releaseOldRead();
  await oldRead;
  const cached = await oneCRequest('allgoods', options);
  assert.equal(JSON.parse(cached.text).quantity, 8, 'Late old response must not repopulate the cache');
  assert.equal(reads, 2);

  const movement = { method: 'POST', body: { Код: 'TEST', Поступлення: 3 }, retries: 2, timeoutMs: 1000 };
  await Promise.all([oneCRequest('edit', movement), oneCRequest('edit', movement)]);
  assert.equal(writes, 2, 'Two independent equal receipts must each reach 1C');
  await oneCRequest('fail', { ...movement, body: { Код: 'TEST', Реалізація: 1 } });
  assert.equal(writes, 3, 'A stock movement must not be repeated automatically after 503');
  console.log('1C stock/cache checks passed: fresh reads, late-response protection, separate movements, no write retries.');
} finally {
  releaseOldRead?.();
  for (const key of ['ONEC_BASE_URL', 'ONEC_AUTH_HEADER', 'ONEC_DEV_DISK_CACHE']) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
