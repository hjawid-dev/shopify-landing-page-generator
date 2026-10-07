/* Renders a built template on this computer, without a store.

   Shopify's own Liquid features that the template uses are replaced with simple stand-ins,
   so the preview shows layout and copy. It is not an exact copy of what Shopify renders. */

import { Liquid } from 'liquidjs';

function money(cents, format) {
  const amount = (Number(cents) / 100).toFixed(2).replace(/\.00$/, '');
  return format.replace('{{amount}}', amount);
}

function createEngine(moneyFormat) {
  const engine = new Liquid();
  engine.registerFilter('money', (cents) => money(cents, moneyFormat));

  // {% form 'product', product, id: 'lp-form' %} … {% endform %}
  engine.registerTag('form', {
    parse(tagToken, remainTokens) {
      this.templates = [];
      const stream = this.liquid.parser
        .parseStream(remainTokens)
        .on('tag:endform', () => stream.stop())
        .on('template', (template) => this.templates.push(template))
        .on('end', () => {
          throw new Error('form tag was not closed');
        });
      stream.start();
    },
    *render(context, emitter) {
      emitter.write('<form id="lp-form" method="post" action="/cart/add">');
      yield this.liquid.renderer.renderTemplates(this.templates, context, emitter);
      emitter.write('</form>');
    },
  });
  return engine;
}

/**
 * @param liquid   a template from buildTemplate
 * @param sample   { shop: { name, money_format }, product: {...} } with made-up product data
 */
export async function renderPreview(liquid, sample) {
  const product = { ...sample.product };
  product.selected_or_first_available_variant = product.variants.find((variant) => variant.available) ?? product.variants[0];
  product.available = product.variants.some((variant) => variant.available);

  const engine = createEngine(sample.shop.money_format ?? '{{amount}}');
  return engine.parseAndRender(liquid, { shop: sample.shop, product, content_for_header: '' });
}
