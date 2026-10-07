/* The publishing steps, in the order that keeps a live store safe:
   everything is checked before anything is written, the upload does not change what
   customers see, and the product is only switched to the new page when asked. */

const numericId = (gid) => gid.split('/').pop();

export function templateFilename(page) {
  return `templates/product.${page.template_name}.liquid`;
}

async function resolveTheme(client, wanted) {
  if (wanted === 'live') {
    const live = (await client.themes()).find((theme) => theme.role === 'MAIN');
    if (!live) throw new Error('The store has no published theme.');
    return live.id;
  }
  if (!/^\d+$/.test(wanted)) throw new Error('--theme must be "live" or a theme id (digits only). Run "lp check" to list the themes.');
  return `gid://shopify/OnlineStoreTheme/${wanted}`;
}

/**
 * @param client   from createClient
 * @param page     a validated page brief
 * @param liquid   the built template
 * @param options  { theme: 'live' | id, assign, overwrite, dryRun, log }
 */
export async function publish(client, page, liquid, { theme, assign = false, overwrite = false, dryRun = false, log = console.log }) {
  if (!theme) throw new Error('Choose where to publish with --theme <id> or --theme live. Run "lp check" to list the themes.');
  const filename = templateFilename(page);

  const themeId = await resolveTheme(client, theme);
  const target = await client.themeFile(themeId, filename);
  if (!target) throw new Error(`Theme ${theme} was not found in the store.`);
  const live = target.role === 'MAIN';
  log(`Theme:    ${target.name} (${live ? 'published' : 'not published'})`);

  if (target.fileExists && !overwrite) {
    throw new Error(`${filename} already exists in that theme. Pass --overwrite to replace it.`);
  }

  const product = await client.product(page.product_handle);
  if (!product) throw new Error(`No product with the handle "${page.product_handle}" was found. Nothing was uploaded.`);
  log(`Product:  ${product.handle}`);

  const previewUrl =
    `https://${client.shop}/products/${product.handle}?view=${page.template_name}` +
    (live ? '' : `&preview_theme_id=${numericId(themeId)}`);

  if (dryRun) {
    log(`Dry run:  would ${target.fileExists ? 'replace' : 'upload'} ${filename} (${(liquid.length / 1024).toFixed(1)} kB)`);
    if (assign) log('Dry run:  would switch the product to the new template');
    return { uploaded: false, assigned: false, previewUrl };
  }

  await client.uploadTemplate(themeId, filename, liquid);
  log(`Uploaded: ${filename} (${(liquid.length / 1024).toFixed(1)} kB)`);

  if (!assign) {
    log(`Preview:  ${previewUrl}`);
    log('The product page is unchanged. Run again with --assign to switch the product to this template.');
    return { uploaded: true, assigned: false, previewUrl };
  }

  if (!live) throw new Error('The template was uploaded, but a product can only be switched to a template in the published theme.');
  await client.assignTemplate(product.id, page.template_name);
  log(`Assigned: https://${client.shop}/products/${product.handle} now uses the new template`);
  return { uploaded: true, assigned: true, previewUrl };
}
