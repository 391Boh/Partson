/* eslint-disable @typescript-eslint/no-require-imports */
// Мокаємо server-only щоб скрипт міг імпортувати Next.js серверні модулі
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, ...args);
};
