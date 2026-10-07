/* Builds the Liquid template for one landing page from a page brief.

   Everything the merchant writes is escaped and placed in the template as text.
   Everything that is a fact about the product (title, price, stock, rating) is left
   as Liquid, so Shopify fills it in from the store's own data when the page is shown. */

import { readFileSync } from 'node:fs';

import { escapeHtml as e, scriptLiteral } from './escape.js';
import { LOCALES } from './locales.js';

const CSS = readFileSync(new URL('./page.css', import.meta.url), 'utf8');
const CLIENT_SCRIPT = readFileSync(new URL('./page.client.js', import.meta.url), 'utf8');

const CHECK_ICON = (className, fill) => `<svg class="${className}" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="9" fill="${fill}"/>
        <path d="M5 9l3 3 5-5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

function announcement(text, s) {
  if (!text) return '';
  // The text is repeated so that the scrolling row has no visible seam.
  const item = `<span class="ann-item">${e(text)}</span><span class="ann-sep" aria-hidden="true">•</span>`;
  return `
  <div class="ann" aria-label="${e(s.offer)}">
    <div class="ann-track">${item.repeat(8)}</div>
  </div>`;
}

function trustBar(labels) {
  if (!labels.length) return '';
  const items = labels
    .map((label) => `
      <div class="ti-item">${CHECK_ICON('ti-check', '#2d6a4f')}<span>${e(label)}</span></div>`)
    .join('');
  return `
  <div class="trust">
    <div class="wrap">${items}</div>
  </div>`;
}

function gallery(images, s) {
  const slides = images
    .map((src, i) => `
          <div class="g-slide${i === 0 ? ' active' : ''}">
            <img src="${e(src)}" alt="${e(s.imageAlt.replace('[n]', i + 1))}" loading="${i === 0 ? 'eager' : 'lazy'}">
          </div>`)
    .join('');
  const thumbs = images
    .map((src, i) => `
          <button class="g-thumb${i === 0 ? ' active' : ''}" data-slide="${i}" type="button" aria-label="${e(s.imageAlt.replace('[n]', i + 1))}">
            <img src="${e(src)}" alt="" loading="lazy">
          </button>`)
    .join('');
  return `
      <div class="gallery">
        <div class="g-main">${slides}</div>
        <div class="g-thumbs">${images.length > 1 ? thumbs : ''}</div>
      </div>`;
}

/* The rating comes from the standard review metafields that Shopify's review apps fill in.
   Nothing is shown for a product without reviews. */
function rating(show, s) {
  if (!show) return '';
  return `
        {%- assign lp_rating = product.metafields.reviews.rating.value -%}
        {%- assign lp_rating_count = product.metafields.reviews.rating_count.value | default: 0 -%}
        {%- if lp_rating and lp_rating_count > 0 -%}
          {%- assign lp_score = lp_rating.rating | plus: 0 -%}
          {%- comment -%} Whole stars are rounded down. The exact score is printed next to them. {%- endcomment -%}
          {%- assign lp_filled = lp_score | floor -%}
          <div class="rating-row">
            <span class="p-stars" aria-hidden="true">{% for i in (1..5) %}{% if i <= lp_filled %}★{% else %}☆{% endif %}{% endfor %}</span>
            <span class="rv-count">{{ lp_score | round: 1 }} · {{ lp_rating_count }} ${e(s.reviews)}</span>
          </div>
        {%- endif -%}`;
}

/* Shown only when Shopify tracks the stock, does not allow overselling, and the real
   quantity is at or below the threshold. */
function lowStock(threshold, s) {
  if (!threshold) return '';
  const text = e(s.onlyLeft).replace('[n]', '{{ lp_variant.inventory_quantity }}');
  return `
        {%- if lp_variant.inventory_management == 'shopify' and lp_variant.inventory_policy == 'deny' and lp_variant.inventory_quantity > 0 and lp_variant.inventory_quantity <= ${Number(threshold)} -%}
          <div class="stock" id="lp-stock"><span class="stock-dot"></span>${text}</div>
        {%- endif -%}`;
}

function bullets(items) {
  if (!items.length) return '';
  const rows = items
    .map((text) => `
          <li class="bullet">${CHECK_ICON('b-check', '#1a1a1a')}<span>${e(text)}</span></li>`)
    .join('');
  return `
        <ul class="bullets">${rows}
        </ul>`;
}

function payment(methods, s) {
  if (!methods.length) return '';
  return `
        <p class="pay-label">${e(s.securePayment)}</p>
        <div class="pay-row">${methods.map((name) => `<span class="pay-badge">${e(name)}</span>`).join('')}</div>`;
}

function problem(block, s) {
  if (!block) return '';
  return `
  <section class="sec sec--dark problem">
    <div class="wrap">
      <p class="prob-eye">${e(block.eyebrow || s.problemEyebrow)}</p>
      <h2 class="prob-h">${e(block.headline)}</h2>
      <p class="prob-body">${e(block.body)}</p>
    </div>
  </section>`;
}

function features(items) {
  if (!items.length) return '';
  const rows = items
    .map((feature, i) => `
      <div class="feat-row${i % 2 ? ' feat-row--rev' : ''}">
        ${feature.image ? `<div class="feat-media"><img src="${e(feature.image)}" alt="${e(feature.title)}" loading="lazy"></div>` : ''}
        <div class="feat-copy">
          <p class="feat-eye">${String(i + 1).padStart(2, '0')}</p>
          <h3>${e(feature.title)}</h3>
          <p>${e(feature.body)}</p>
        </div>
      </div>`)
    .join('');
  return `
  <section class="sec features">
    <div class="wrap">${rows}
    </div>
  </section>`;
}

function faq(items, s) {
  if (!items.length) return '';
  const rows = items
    .map((item, i) => `
        <div class="faq-item">
          <button class="faq-q" type="button" aria-expanded="false" aria-controls="lp-faq-${i}">
            <span>${e(item.q)}</span>
            <svg class="faq-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="faq-a" id="lp-faq-${i}" hidden><p>${e(item.a)}</p></div>
        </div>`)
    .join('');
  return `
  <section class="sec sec--soft faq-sec">
    <div class="wrap">
      <h2 class="sec-h">${e(s.faqHeading)}</h2>
      <div class="faq-list">${rows}
      </div>
    </div>
  </section>`;
}

/* Review cards are shown only when the brief contains reviews. They are quoted as written. */
function reviews(items, s) {
  if (!items.length) return '';
  const cards = items
    .map((review) => `
        <div class="rv-card">
          <div class="rv-stars" aria-hidden="true">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
          <p class="rv-text">“${e(review.text)}”</p>
          <p class="rv-meta">${e(review.name)}${review.location ? ` · ${e(review.location)}` : ''}</p>
        </div>`)
    .join('');
  return `
  <section class="sec reviews-sec">
    <div class="wrap">
      <h2 class="sec-h">${e(s.reviewsHeading)}</h2>
      <div class="rv-grid">${cards}
      </div>
    </div>
  </section>`;
}

/** The complete Liquid template for a page brief that has passed validatePage. */
export function buildTemplate(page) {
  const s = LOCALES[page.locale];
  const clientStrings = { addToCart: s.addToCart, soldOut: s.soldOut, adding: s.adding, addFailed: s.addFailed };
  const saveBadge = e(s.save).replace('[pct]', '{{ lp_pct }}');

  return `{% layout none %}<!DOCTYPE html>
<html lang="${e(page.locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ product.title | escape }} – {{ shop.name | escape }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap" rel="stylesheet">
  {{ content_for_header }}
  <style>
${CSS}  </style>
</head>
<body>
  {%- assign lp_variant = product.selected_or_first_available_variant -%}
${announcement(page.announcement, s)}
${trustBar(page.trust ?? [])}

  <section class="hero">
    <div class="wrap">
${gallery(page.images, s)}

      <div class="pinfo">
${rating(page.show_rating, s)}

        <h1 class="p-title">{{ product.title | escape }}</h1>
        ${page.subtitle ? `<p class="p-sub">${e(page.subtitle)}</p>` : ''}

        <div class="price-row">
          {%- if product.compare_at_price > product.price -%}
            {%- comment -%} Rounded down, so the badge never overstates the saving. {%- endcomment -%}
            {%- assign lp_pct = product.compare_at_price | minus: product.price | times: 100 | divided_by: product.compare_at_price | floor -%}
            <span class="p-compare">{{ product.compare_at_price | money }}</span>
            <span class="p-price">{{ product.price | money }}</span>
            <span class="p-badge">${saveBadge}</span>
          {%- else -%}
            <span class="p-price">{{ product.price | money }}</span>
          {%- endif -%}
        </div>
${lowStock(page.low_stock_threshold, s)}
${bullets(page.bullets ?? [])}

        {%- if product.variants.size > 1 -%}
          {%- assign lp_option = product.options_with_values[0] -%}
          <div class="variants">
            <div class="var-label">{{ lp_option.name | escape }}</div>
            <div class="var-opts">
              {%- for value in lp_option.values -%}
                <button class="var-btn{% if value == lp_variant.option1 %} sel{% endif %}" type="button" data-val="{{ value | escape }}" data-opt="option1">{{ value | escape }}</button>
              {%- endfor -%}
            </div>
          </div>
        {%- endif -%}

        {% form 'product', product, id: 'lp-form' %}
          <input type="hidden" name="id" id="lp-vid" value="{{ lp_variant.id }}">
          <button type="submit" class="atc" id="lp-atc"{% unless product.available %} disabled{% endunless %}>
            {%- if product.available -%}${e(s.addToCart)}{%- else -%}${e(s.soldOut)}{%- endif -%}
          </button>
        {% endform %}
${payment(page.payment_methods ?? [], s)}
      </div>
    </div>
  </section>
${problem(page.problem, s)}
${features(page.features ?? [])}
${faq(page.faq ?? [], s)}
${reviews(page.reviews ?? [], s)}

  <footer class="lp-foot">
    <p>© {{ 'now' | date: '%Y' }} {{ shop.name | escape }}
      · <a href="/policies/privacy-policy">${e(s.privacy)}</a>
      · <a href="/policies/refund-policy">${e(s.returns)}</a>
    </p>
  </footer>

  <script type="application/json" id="lp-data">
    {"variants": {{ product.variants | json }}, "initialVariantId": {{ lp_variant.id | json }}, "strings": ${scriptLiteral(clientStrings)}}
  </script>
  <script>
${CLIENT_SCRIPT}  </script>
</body>
</html>
`;
}
