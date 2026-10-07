import { LOCALES } from './locales.js';

/* Fields from the first version of the tool that let the merchant type in stock levels,
   ratings and customer counts by hand. They are rejected with an explanation, because
   those numbers now come from Shopify. */
const REMOVED = {
  urgency: 'stock is read from Shopify. Use "low_stock_threshold" to show it when stock is low',
  rating: 'the rating is read from the product\'s review metafields. Use "show_rating"',
  review_count: 'the number of reviews is read from the product\'s review metafields. Use "show_rating"',
  social_proof_count: 'a customer count cannot be checked against store data, so it is no longer shown',
};

const KNOWN = new Set([
  'product_handle', 'template_name', 'locale', 'announcement', 'subtitle', 'trust', 'images', 'bullets',
  'low_stock_threshold', 'show_rating', 'payment_methods', 'problem', 'features', 'faq', 'reviews',
]);

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isImage = (value) => isText(value) && !/[\s"'<>]/.test(value);

/** Returns a list of problems with a page brief. An empty list means it can be built. */
export function validatePage(page, { requireHttpsImages = false } = {}) {
  const errors = [];
  if (!page || typeof page !== 'object' || Array.isArray(page)) return ['the brief must be a JSON object'];

  for (const key of Object.keys(page)) {
    if (REMOVED[key]) errors.push(`"${key}" is not supported: ${REMOVED[key]}`);
    else if (!KNOWN.has(key)) errors.push(`unknown field "${key}"`);
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.product_handle ?? '')) {
    errors.push('"product_handle" must be the product\'s handle, for example "insulated-bottle"');
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.template_name ?? '') || String(page.template_name).length > 40) {
    errors.push('"template_name" must be lowercase letters, digits and hyphens, at most 40 characters');
  }
  if (!Object.hasOwn(LOCALES, page.locale ?? '')) {
    errors.push(`"locale" must be one of: ${Object.keys(LOCALES).join(', ')}`);
  }

  const images = [...(Array.isArray(page.images) ? page.images : []), ...(page.features ?? []).map((f) => f?.image)];
  if (!Array.isArray(page.images) || page.images.length === 0) errors.push('"images" must list at least one image');
  for (const image of images) {
    if (!isImage(image)) errors.push(`image "${image}" is not a usable address`);
    else if (requireHttpsImages && !image.startsWith('https://')) {
      errors.push(`image "${image}" must be an https address to be published`);
    }
  }

  for (const key of ['announcement', 'subtitle']) {
    if (page[key] !== undefined && !isText(page[key])) errors.push(`"${key}" must be text`);
  }
  for (const key of ['trust', 'bullets', 'payment_methods']) {
    if (page[key] !== undefined && !(Array.isArray(page[key]) && page[key].every(isText))) {
      errors.push(`"${key}" must be a list of texts`);
    }
  }
  if (page.low_stock_threshold !== undefined) {
    const n = page.low_stock_threshold;
    if (!Number.isInteger(n) || n < 1 || n > 20) errors.push('"low_stock_threshold" must be a whole number from 1 to 20');
  }
  if (page.show_rating !== undefined && typeof page.show_rating !== 'boolean') {
    errors.push('"show_rating" must be true or false');
  }
  if (page.problem !== undefined && !(isText(page.problem?.headline) && isText(page.problem?.body))) {
    errors.push('"problem" needs a "headline" and a "body"');
  }
  for (const [index, feature] of (page.features ?? []).entries()) {
    if (!(isText(feature?.title) && isText(feature?.body))) errors.push(`feature ${index + 1} needs a "title" and a "body"`);
  }
  for (const [index, item] of (page.faq ?? []).entries()) {
    if (!(isText(item?.q) && isText(item?.a))) errors.push(`FAQ item ${index + 1} needs a "q" and an "a"`);
  }
  for (const [index, review] of (page.reviews ?? []).entries()) {
    const ratingOk = Number.isInteger(review?.rating) && review.rating >= 1 && review.rating <= 5;
    if (!(isText(review?.name) && isText(review?.text) && ratingOk)) {
      errors.push(`review ${index + 1} needs a "name", a "text" and a "rating" from 1 to 5`);
    }
  }
  return errors;
}
