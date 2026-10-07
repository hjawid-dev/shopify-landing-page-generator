import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { escapeHtml, scriptLiteral } from '../src/escape.js';
import { renderPreview } from '../src/preview.js';
import { buildTemplate } from '../src/template.js';
import { examplePage, sampleStore } from './helpers.js';

// The rendered page without its stylesheet and script, so that class names in the CSS do not count as content.
async function render(page, store = sampleStore()) {
  const html = await renderPreview(buildTemplate(page), store);
  return html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/, '');
}

function withFirstVariant(changes) {
  const store = sampleStore();
  Object.assign(store.product.variants[0], changes);
  return store;
}

test('copy is escaped for HTML and for Liquid', () => {
  assert.equal(escapeHtml(`<b>"A" & 'B'</b> {{ shop.name }} {% raw %}`), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt; &#123;&#123; shop.name &#125;&#125; &#123;% raw %&#125;');
  const literal = scriptLiteral({ text: '</script>{{ x }} {% y %}', nested: { list: [{ a: 1 }] } });
  assert.ok(!literal.includes('</script>') && !literal.includes('{{') && !literal.includes('{%'));
  assert.deepEqual(JSON.parse(literal), { text: '</script>{{ x }} {% y %}', nested: { list: [{ a: 1 }] } });
});

test('markup and Liquid in the brief end up as visible text, not as code', async () => {
  const page = { ...examplePage(), subtitle: '<script>alert(1)</script> {{ shop.secret }}', bullets: ['"quoted" & {% if true %}'] };
  const html = await render(page);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &#123;&#123; shop.secret &#125;&#125;'));
  assert.ok(html.includes('&quot;quoted&quot; &amp; &#123;% if true %&#125;'));
});

test('the page script and styles contain nothing Liquid would try to run', () => {
  for (const file of ['page.client.js', 'page.css']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.ok(!source.includes('{{') && !source.includes('{%'), file);
  }
});

test('facts about the product are left to Shopify', () => {
  const liquid = buildTemplate(examplePage());
  assert.ok(liquid.includes('{{ product.title | escape }}'));
  assert.ok(liquid.includes('{{ product.price | money }}'));
  assert.ok(liquid.includes('product.metafields.reviews.rating.value'));
  assert.ok(liquid.includes('lp_variant.inventory_quantity'));
  // No rating, review count or stock figure is written into the template itself.
  assert.ok(!/4\.6|128|Only 4/.test(liquid));
});

test('the low stock line follows the real inventory', async () => {
  assert.match(await render(examplePage()), /Only 4 left in stock/);
  assert.doesNotMatch(await render(examplePage(), withFirstVariant({ inventory_quantity: 6 })), /left in stock/);
  assert.doesNotMatch(await render(examplePage(), withFirstVariant({ inventory_quantity: 0 })), /left in stock/);
});

test('no stock line when Shopify does not track the stock or allows overselling', async () => {
  assert.doesNotMatch(await render(examplePage(), withFirstVariant({ inventory_management: null })), /left in stock/);
  assert.doesNotMatch(await render(examplePage(), withFirstVariant({ inventory_policy: 'continue' })), /left in stock/);
});

test('no stock line unless the brief asks for one', async () => {
  const page = examplePage();
  delete page.low_stock_threshold;
  assert.doesNotMatch(await render(page), /left in stock/);
});

test('the rating comes from the review metafields and is hidden without reviews', async () => {
  const html = await render(examplePage());
  assert.match(html, /4\.6 · 128 reviews/);
  assert.match(html, /★★★★☆/);

  const noReviews = sampleStore();
  noReviews.product.metafields = {};
  assert.doesNotMatch(await render(examplePage(), noReviews), /rating-row/);

  const zeroReviews = sampleStore();
  zeroReviews.product.metafields.reviews.rating_count.value = 0;
  assert.doesNotMatch(await render(examplePage(), zeroReviews), /rating-row/);

  assert.doesNotMatch(await render({ ...examplePage(), show_rating: false }), /rating-row/);
});

test('the saving is shown only when there is one, rounded down', async () => {
  const html = await render(examplePage());
  assert.match(html, /299 kr/);
  assert.match(html, /Save 16%/);

  const noSale = sampleStore();
  noSale.product.compare_at_price = null;
  const plain = await render(examplePage(), noSale);
  assert.doesNotMatch(plain, /p-badge|p-compare/);
  assert.match(plain, /249 kr/);
});

test('sections without content are left out', async () => {
  const page = examplePage();
  const full = await render(page);
  assert.match(full, /class="sec sec--dark problem"/);
  assert.doesNotMatch(full, /reviews-sec/);

  const minimal = await render({ product_handle: page.product_handle, template_name: page.template_name, locale: 'en', images: page.images.slice(0, 1) });
  for (const section of ['class="ann"', 'class="trust"', 'problem', 'features', 'faq-sec', 'reviews-sec', 'pay-row', 'data-slide=']) {
    assert.ok(!minimal.includes(section), section);
  }
});

test('review cards appear when the brief has reviews', async () => {
  const html = await render({ ...examplePage(), reviews: [{ name: 'Test Person', location: 'Test Town', rating: 4, text: 'Placeholder text for the test.' }] });
  assert.match(html, /“Placeholder text for the test\.”/);
  assert.match(html, /Test Person · Test Town/);
  assert.match(html, /★★★★☆/);
});

test('the interface follows the chosen market', async () => {
  const html = await render({ ...examplePage(), locale: 'sv' });
  assert.match(html, /<html lang="sv">/);
  assert.match(html, /Lägg i kundvagn/);
  assert.match(html, /Endast 4 kvar i lager/);
  assert.match(html, /Spara 16 %/);
  assert.match(html, /Vanliga frågor/);
});

test('a sold out product cannot be added to the cart', async () => {
  const store = sampleStore();
  store.product.variants.forEach((variant) => Object.assign(variant, { available: false, inventory_quantity: 0 }));
  const html = await render(examplePage(), store);
  assert.match(html, /id="lp-atc" disabled>Sold out</);
});
