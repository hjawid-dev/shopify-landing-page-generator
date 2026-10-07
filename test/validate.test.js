import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOCALES } from '../src/locales.js';
import { validatePage } from '../src/validate.js';
import { examplePage } from './helpers.js';

test('the example briefs are valid', () => {
  assert.deepEqual(validatePage(examplePage()), []);
});

test('a brief with nothing in it lists what is missing', () => {
  const errors = validatePage({});
  assert.equal(errors.length, 4);
  assert.match(errors.join('\n'), /product_handle/);
  assert.match(errors.join('\n'), /template_name/);
  assert.match(errors.join('\n'), /locale/);
  assert.match(errors.join('\n'), /images/);
});

test('hand-typed stock, ratings and customer counts are rejected with an explanation', () => {
  const errors = validatePage({ ...examplePage(), urgency: 'Only 12 left', rating: 4.8, review_count: 214, social_proof_count: '18 000+' });
  assert.equal(errors.length, 4);
  assert.match(errors[0], /"urgency" is not supported: stock is read from Shopify/);
});

test('an unknown field is reported, which catches typos', () => {
  assert.deepEqual(validatePage({ ...examplePage(), bulets: [] }), ['unknown field "bulets"']);
});

test('a template name cannot escape the templates folder', () => {
  for (const name of ['../layout/theme', 'Product', 'a b', '']) {
    assert.match(validatePage({ ...examplePage(), template_name: name }).join('\n'), /template_name/, name);
  }
});

test('publishing requires https image addresses, previewing does not', () => {
  assert.deepEqual(validatePage(examplePage()), []);
  const errors = validatePage(examplePage(), { requireHttpsImages: true });
  assert.equal(errors.length, 6);
  assert.match(errors[0], /must be an https address/);
});

test('reviews need a name, a text and a whole rating from 1 to 5', () => {
  const page = { ...examplePage(), reviews: [{ name: 'A', text: 'Fine', rating: 5 }, { name: 'B', text: 'Fine', rating: 4.5 }, { text: 'No name', rating: 3 }] };
  assert.deepEqual(validatePage(page), [
    'review 2 needs a "name", a "text" and a "rating" from 1 to 5',
    'review 3 needs a "name", a "text" and a "rating" from 1 to 5',
  ]);
});

test('every market has the same interface texts', () => {
  const keys = Object.keys(LOCALES.en).sort();
  for (const [locale, strings] of Object.entries(LOCALES)) {
    assert.deepEqual(Object.keys(strings).sort(), keys, locale);
    for (const [key, text] of Object.entries(strings)) assert.ok(text.trim(), `${locale}.${key}`);
    assert.ok(strings.onlyLeft.includes('[n]') && strings.save.includes('[pct]') && strings.imageAlt.includes('[n]'), locale);
  }
});
