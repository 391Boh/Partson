// oneC.js against a fake 1C: stale-while-revalidate for the slow directories,
// a deadline on trickling answers, a busy queue as a result (not a throw), and
// no 1C address in error bodies.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

let getprodCalls = 0;
const sockets = new Set();
const server = http.createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url.endsWith('/getprod')) {
      getprodCalls++;
      setTimeout(() => response.end(JSON.stringify({ version: getprodCalls })), 40);
    } else if (request.url.endsWith('/trickle')) {
      // Never idle for long, never finished.
      const timer = setInterval(() => response.write(' '), 50);
      response.on('close', () => clearInterval(timer));
    } else if (request.url.endsWith('/slow')) {
      setTimeout(() => response.end('{}'), 400);
    } else {
      response.end('{}');
    }
  });
});
server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
process.env.ONEC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.ONEC_AUTH_HEADER = 'test-only';
process.env.ONEC_DEV_DISK_CACHE = '0';
process.env.ONEC_SLOW_CONCURRENCY = '1';
const source = readFileSync(new URL('../app/api/_lib/oneC.js', import.meta.url), 'utf8');
const { oneCRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const warn = console.warn;
console.warn = () => {};

try {
  // Stale-while-revalidate: an expired tree is answered at once while one
  // background call refreshes it.
  const tree = { method: 'POST', body: {}, retries: 0, timeoutMs: 1000, cacheTtlMs: 60 };
  assert.equal(JSON.parse((await oneCRequest('getprod', tree)).text).version, 1);
  await sleep(80);
  const started = Date.now();
  const stale = await oneCRequest('getprod', tree);
  assert.equal(JSON.parse(stale.text).version, 1, 'Expired tree is served stale');
  assert.ok(Date.now() - started < 30, 'Stale answer does not wait for 1C');
  await oneCRequest('getprod', tree);
  await sleep(80);
  assert.equal(getprodCalls, 2, 'One background refresh, not one per caller');
  assert.equal(JSON.parse((await oneCRequest('getprod', { ...tree, cacheTtlMs: 60000 })).text).version, 2, 'Refreshed tree replaces the stale one');

  // A trickling answer is cut by the overall deadline (timeout + 1s).
  const trickleStart = Date.now();
  const trickle = await oneCRequest('trickle', { retries: 0, timeoutMs: 300 });
  assert.equal(trickle.status, 500);
  assert.ok(Date.now() - trickleStart < 2500, 'Deadline bounds the whole request');

  // No 1C address in the error a browser can see.
  const body = JSON.parse(trickle.text);
  assert.equal(body.error, '1C Service unreachable');
  assert.ok(!trickle.text.includes(String(port)) && !trickle.text.includes('127.0.0.1'), 'Error body has no 1C URL');

  // A request that waits too long for a slot is a 503 result.
  const first = oneCRequest('slow', { method: 'POST', body: { n: 1 }, retries: 0, timeoutMs: 1000 });
  const queued = await oneCRequest('slow', { method: 'POST', body: { n: 2 }, retries: 0, timeoutMs: 100 });
  assert.equal(queued.status, 503, 'Queue timeout resolves, not rejects');
  assert.equal(JSON.parse(queued.text).error, '1C Service busy');
  await first;
} finally {
  console.warn = warn;
  for (const socket of sockets) socket.destroy();
  server.close();
}

console.log('1C client passed: stale-while-revalidate, request deadline, queue timeout as 503, no 1C URL in errors.');
