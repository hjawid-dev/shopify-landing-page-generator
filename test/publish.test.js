import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publish } from '../src/publish.js';
import { configFromEnv, createClient } from '../src/shopify.js';
import { examplePage } from './helpers.js';

const LIVE = { id: 'gid://shopify/OnlineStoreTheme/100', name: 'Live theme', role: 'MAIN' };
const DRAFT = { id: 'gid://shopify/OnlineStoreTheme/200', name: 'Draft theme', role: 'UNPUBLISHED' };
const PRODUCT = { id: 'gid://shopify/Product/1', handle: 'insulated-bottle', templateSuffix: null };

/** A stand-in for the API client that records every call. */
function fakeClient({ fileExists = false, product = PRODUCT, themes = [LIVE, DRAFT] } = {}) {
  const calls = [];
  return {
    calls,
    shop: 'example.myshopify.com',
    async themes() {
      calls.push('themes');
      return themes;
    },
    async themeFile(themeId) {
      calls.push('themeFile');
      const theme = themes.find((candidate) => candidate.id === themeId);
      return theme ? { ...theme, fileExists } : null;
    },
    async product() {
      calls.push('product');
      return product;
    },
    async uploadTemplate(themeId, filename) {
      calls.push(`upload ${filename} to ${themeId}`);
    },
    async assignTemplate(productId, suffix) {
      calls.push(`assign ${suffix} to ${productId}`);
    },
  };
}

const quiet = { log: () => {} };
const written = (client) => client.calls.filter((call) => call.startsWith('upload') || call.startsWith('assign'));

test('uploading to a draft theme changes nothing customers see and gives a preview link', async () => {
  const client = fakeClient();
  const result = await publish(client, examplePage(), '<liquid>', { theme: '200', ...quiet });
  assert.deepEqual(written(client), ['upload templates/product.lp-insulated-bottle.liquid to gid://shopify/OnlineStoreTheme/200']);
  assert.equal(result.previewUrl, 'https://example.myshopify.com/products/insulated-bottle?view=lp-insulated-bottle&preview_theme_id=200');
});

test('the product is only switched to the new template with --assign', async () => {
  const withoutAssign = fakeClient();
  await publish(withoutAssign, examplePage(), '<liquid>', { theme: 'live', ...quiet });
  assert.equal(written(withoutAssign).length, 1);

  const withAssign = fakeClient();
  await publish(withAssign, examplePage(), '<liquid>', { theme: 'live', assign: true, ...quiet });
  assert.deepEqual(written(withAssign), [
    'upload templates/product.lp-insulated-bottle.liquid to gid://shopify/OnlineStoreTheme/100',
    'assign lp-insulated-bottle to gid://shopify/Product/1',
  ]);
});

test('a theme must be chosen', async () => {
  const client = fakeClient();
  await assert.rejects(publish(client, examplePage(), '<liquid>', quiet), /--theme/);
  assert.deepEqual(client.calls, []);
});

test('an existing template is not replaced without --overwrite', async () => {
  const client = fakeClient({ fileExists: true });
  await assert.rejects(publish(client, examplePage(), '<liquid>', { theme: 'live', ...quiet }), /already exists/);
  assert.deepEqual(written(client), []);

  const allowed = fakeClient({ fileExists: true });
  await publish(allowed, examplePage(), '<liquid>', { theme: 'live', overwrite: true, ...quiet });
  assert.equal(written(allowed).length, 1);
});

test('nothing is uploaded when the product does not exist', async () => {
  const client = fakeClient({ product: null });
  await assert.rejects(publish(client, examplePage(), '<liquid>', { theme: 'live', ...quiet }), /Nothing was uploaded/);
  assert.deepEqual(written(client), []);
});

test('nothing is uploaded when the theme does not exist', async () => {
  const client = fakeClient();
  await assert.rejects(publish(client, examplePage(), '<liquid>', { theme: '999', ...quiet }), /was not found/);
  await assert.rejects(publish(client, examplePage(), '<liquid>', { theme: 'main', ...quiet }), /must be "live" or a theme id/);
  assert.deepEqual(written(client), []);
});

test('a dry run reads but never writes', async () => {
  const client = fakeClient();
  const result = await publish(client, examplePage(), '<liquid>', { theme: 'live', assign: true, dryRun: true, ...quiet });
  assert.deepEqual(written(client), []);
  assert.deepEqual({ uploaded: result.uploaded, assigned: result.assigned }, { uploaded: false, assigned: false });
});

test('a product cannot be switched to a template that only exists in a draft theme', async () => {
  const client = fakeClient();
  await assert.rejects(publish(client, examplePage(), '<liquid>', { theme: '200', assign: true, ...quiet }), /published theme/);
  assert.equal(written(client).filter((call) => call.startsWith('assign')).length, 0);
});

/* ---------- the API client, against a stand-in for fetch ---------- */

function fakeFetch(responses) {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    const next = responses.shift();
    return { ok: next.status === 200, status: next.status, json: async () => next.body, text: async () => JSON.stringify(next.body ?? '') };
  };
  return { fetch, requests };
}

const CONFIG = { shop: 'example.myshopify.com', clientId: 'id', clientSecret: 'secret' };
const TOKEN = { status: 200, body: { access_token: 'token-1' } };

test('the client signs in once and sends the token with each request', async () => {
  const { fetch, requests } = fakeFetch([
    TOKEN,
    { status: 200, body: { data: { themes: { nodes: [LIVE] } } } },
    { status: 200, body: { data: { productByIdentifier: PRODUCT } } },
  ]);
  const client = createClient({ ...CONFIG, fetch });
  assert.deepEqual(await client.themes(), [LIVE]);
  assert.deepEqual(await client.product('insulated-bottle'), PRODUCT);

  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, 'https://example.myshopify.com/admin/oauth/access_token');
  assert.equal(requests[0].body.grant_type, 'client_credentials');
  assert.match(requests[1].url, /^https:\/\/example\.myshopify\.com\/admin\/api\/\d{4}-\d{2}\/graphql\.json$/);
  assert.equal(requests[1].headers['X-Shopify-Access-Token'], 'token-1');
  assert.deepEqual(requests[2].body.variables, { handle: 'insulated-bottle' });
});

test('the upload sends the template as a text file', async () => {
  const { fetch, requests } = fakeFetch([TOKEN, { status: 200, body: { data: { themeFilesUpsert: { upsertedThemeFiles: [], userErrors: [] } } } }]);
  await createClient({ ...CONFIG, fetch }).uploadTemplate(DRAFT.id, 'templates/product.x.liquid', '<liquid>');
  assert.deepEqual(requests[1].body.variables, {
    themeId: DRAFT.id,
    files: [{ filename: 'templates/product.x.liquid', body: { type: 'TEXT', value: '<liquid>' } }],
  });
});

test('errors from Shopify stop the run with a readable message', async () => {
  const userError = fakeFetch([TOKEN, { status: 200, body: { data: { productUpdate: { product: null, userErrors: [{ message: 'Template suffix is invalid' }] } } } }]);
  await assert.rejects(createClient({ ...CONFIG, fetch: userError.fetch }).assignTemplate(PRODUCT.id, 'x'), /Template suffix is invalid/);

  const graphqlError = fakeFetch([TOKEN, { status: 200, body: { errors: [{ message: 'Access denied for themes field' }] } }]);
  await assert.rejects(createClient({ ...CONFIG, fetch: graphqlError.fetch }).themes(), /Access denied for themes field/);

  const notInstalled = fakeFetch([{ status: 400, body: 'Oauth error app_not_installed' }]);
  await assert.rejects(createClient({ ...CONFIG, fetch: notInstalled.fetch }).themes(), /not installed on this store/);
});

test('the secret is never sent anywhere but a Shopify store address', () => {
  for (const shop of ['example.com', 'example.myshopify.com.evil.test', 'https://example.myshopify.com', 'example.myshopify.com/path']) {
    assert.throws(() => createClient({ ...CONFIG, shop }), /myshopify\.com/, shop);
  }
});

test('missing settings are named', () => {
  assert.throws(() => configFromEnv({ SHOPIFY_SHOP: 'example.myshopify.com' }), /SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET/);
});
