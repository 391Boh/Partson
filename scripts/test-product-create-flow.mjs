import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

async function checkFlow(updateOk) {
  const requests = [];
  const navigations = [];
  const state = [];
  let finishUpdate;
  const updatePromise = new Promise(resolve => { finishUpdate = resolve; });
  const jsx = (type, props) => ({ type, props });
  const noop = () => {};
  const mocks = {
    'react': { useEffect: noop, useRef: () => ({ current: null }), useState: initial => {
      const index = state.length;
      state.push(initial && typeof initial === 'object' && 'priceEuro' in initial
        ? { ...initial, name: 'Test', article: 'ARTICLE-42', priceEuro: '12,50', costPriceEuro: '8,25', quantity: '3' }
        : initial);
      return [state[index], value => { state[index] = value; }];
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ push: url => navigations.push(url) }) },
    'lucide-react': {},
    'app/components/Data': { clearBrowserCatalogCache: noop },
    'app/lib/catalog-client-cache': { invalidateCatalogClientCache: noop },
    'app/lib/firebase-auth-state': { waitForFirebaseAuthReady: async () => ({ user: { getIdToken: async () => 'test' } }) },
    'app/lib/product-image-upload-client': {},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('app/components/ProductCreateModal.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => { assert.ok(mocks[name], name); return mocks[name]; },
    setTimeout: fn => fn(), fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (url.includes('product-create')) return { ok: true, json: async () => ({ ok: true, code: 'CODE-7', article: 'ARTICLE-42' }) };
      await updatePromise;
      return { ok: updateOk, json: async () => ({ ok: updateOk, error: updateOk ? undefined : 'Price rejected' }) };
    },
  });
  const tree = exports.default({ isOpen: true, onClose: noop });
  const find = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && [node.props.children].flat().includes('Створити товар')) return node;
    return [node.props?.children].flat(Infinity).map(find).find(Boolean);
  };
  find(tree).props.onClick();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.article, 'ARTICLE-42');
  assert.equal(requests[1].body.Код, 'CODE-7');
  assert.equal(requests[1].body.ЦінаПрод, 12.5);
  assert.equal(requests[1].body.ЦінаЗакуп, 8.25);
  assert.equal(requests[1].body.Кількість, 3);
  assert.equal(requests[1].body.requirePriceConfirmation, true);
  assert.equal(navigations.length, 0, 'Wait for price persistence before navigating');
  finishUpdate();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(navigations.length, updateOk ? 1 : 0);
  if (!updateOk) assert.ok(state.some(value => typeof value === 'string' && value.includes('Price rejected')));
}
await checkFlow(true);
await checkFlow(false);
console.log('Create flow passed: article lookup, decimal prices, quantity, awaiting save and failure handling.');
