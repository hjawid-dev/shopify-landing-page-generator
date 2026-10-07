/* Runs on the published landing page. It is inlined into the template as it is,
   and reads its data from the JSON block the template renders next to it. */

const data = JSON.parse(document.getElementById('lp-data').textContent);
const { variants, strings, initialVariantId } = data;

/* Gallery */
const slides = document.querySelectorAll('.g-slide');
const thumbs = document.querySelectorAll('.g-thumb');
thumbs.forEach((thumb) => {
  thumb.addEventListener('click', () => {
    const chosen = Number(thumb.dataset.slide);
    slides.forEach((slide, index) => slide.classList.toggle('active', index === chosen));
    thumbs.forEach((other, index) => other.classList.toggle('active', index === chosen));
  });
});

/* Variants */
const variantInput = document.getElementById('lp-vid');
const addButton = document.getElementById('lp-atc');
const stockLine = document.getElementById('lp-stock');

function syncVariant() {
  const chosen = {};
  document.querySelectorAll('.var-btn.sel').forEach((button) => {
    chosen[button.dataset.opt] = button.dataset.val;
  });
  const match = variants.find((variant) => Object.keys(chosen).every((option) => variant[option] === chosen[option]));
  if (!match) return;
  variantInput.value = match.id;
  addButton.disabled = !match.available;
  addButton.textContent = match.available ? strings.addToCart : strings.soldOut;
  // The stock line was rendered for the first variant, so it is only shown for that one.
  if (stockLine) stockLine.hidden = match.id !== initialVariantId;
}

document.querySelectorAll('.var-btn').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll(`.var-btn[data-opt="${button.dataset.opt}"]`).forEach((other) => other.classList.remove('sel'));
    button.classList.add('sel');
    syncVariant();
  });
});

/* Add to cart without leaving the page until it has succeeded */
document.getElementById('lp-form').addEventListener('submit', (event) => {
  event.preventDefault();
  addButton.disabled = true;
  addButton.textContent = strings.adding;
  fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(variantInput.value), quantity: 1 }),
  })
    .then((response) => {
      if (!response.ok) throw new Error('add to cart failed');
      window.location.href = '/cart';
    })
    .catch(() => {
      addButton.disabled = false;
      addButton.textContent = strings.addToCart;
      alert(strings.addFailed);
    });
});

/* FAQ accordion */
document.querySelectorAll('.faq-q').forEach((button) => {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    document.getElementById(button.getAttribute('aria-controls')).hidden = open;
  });
});
