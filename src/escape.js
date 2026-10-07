const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  // Braces are escaped too, so that copy containing {{ or {% is shown as text
  // instead of being run as Liquid by Shopify.
  '{': '&#123;',
  '}': '&#125;',
};

/** Makes a piece of copy safe to place in HTML text, in an attribute and in a Liquid template. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'{}]/g, (char) => ENTITIES[char]);
}

const LINE_SEPARATORS = String.fromCharCode(0x2028, 0x2029);
// "<" and ">" could end the script element, and the line separators break older parsers.
const UNSAFE_IN_SCRIPT = new RegExp(`[<>${LINE_SEPARATORS}]`, 'g');
const unicodeEscape = (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;

/**
 * A value as JSON that is safe inside a script element in a Liquid template.
 * "{{" and "{%" would be run as Liquid. In JSON they can only occur inside a string,
 * so escaping the brace there keeps the JSON valid.
 */
export function scriptLiteral(value) {
  return JSON.stringify(value)
    .replace(UNSAFE_IN_SCRIPT, unicodeEscape)
    .replace(/\{(?=[{%])/g, unicodeEscape);
}
