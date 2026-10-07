#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { renderPreview } from './preview.js';
import { publish, templateFilename } from './publish.js';
import { REQUIRED_SCOPES, configFromEnv, createClient } from './shopify.js';
import { buildTemplate } from './template.js';
import { validatePage } from './validate.js';

const HELP = `Usage: lp <command> [options]

  preview <brief.json>   Build the page and render it locally to out/preview.html
      --product <file>   Made-up product data to render with (default: examples/sample-product.json)
  build <brief.json>     Write the Liquid template to out/theme/templates/ without contacting a store
  check                  Sign in to the store and list its themes and the app's access. Changes nothing.
  publish <brief.json>   Upload the template to a theme
      --theme <id|live>  Theme to upload to. Required.
      --assign           Also switch the product to the new template (published theme only)
      --overwrite        Replace a template with the same name
      --dry-run          Check everything and show what would happen, without uploading
`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function loadBrief(file, { requireHttpsImages = false } = {}) {
  if (!file) fail('give the path to a page brief, for example examples/insulated-bottle.en.json');
  if (!existsSync(file)) fail(`${file} does not exist`);
  let page;
  try {
    page = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
  const errors = validatePage(page, { requireHttpsImages });
  if (errors.length) fail(`${file} has ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  return page;
}

/** Shopify serves images fastest from its own CDN, so point out the ones that live elsewhere. */
function noteRemoteImages(page) {
  const images = [...page.images, ...(page.features ?? []).map((feature) => feature.image).filter(Boolean)];
  const remote = images.filter((image) => !/^https:\/\/cdn\.shopify\.com\//.test(image));
  if (remote.length) console.log(`Note: ${remote.length} image(s) are not on Shopify's CDN. Upload them under Content → Files for faster pages.`);
}

function writeOut(relativePath, content) {
  const file = path.join('out', relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function connect() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return createClient(configFromEnv());
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      product: { type: 'string', default: 'examples/sample-product.json' },
      theme: { type: 'string' },
      assign: { type: 'boolean', default: false },
      overwrite: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, briefFile] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  if (command === 'build') {
    const page = loadBrief(briefFile);
    // Laid out like a theme folder, so the file can also be pushed with the Shopify CLI.
    console.log(`Wrote ${writeOut(path.join('theme', templateFilename(page)), buildTemplate(page))}`);
    noteRemoteImages(page);
    return;
  }

  if (command === 'preview') {
    const page = loadBrief(briefFile);
    // Image paths in the brief are relative to the brief, so point them at the files on disk.
    const resolve = (image) => (/^https?:/.test(image) ? image : pathToFileURL(path.resolve(path.dirname(briefFile), image)).href);
    const local = { ...page, images: page.images.map(resolve), features: page.features?.map((f) => ({ ...f, image: f.image && resolve(f.image) })) };
    const sample = JSON.parse(readFileSync(values.product, 'utf8'));
    console.log(`Wrote ${writeOut('preview.html', await renderPreview(buildTemplate(local), sample))}`);
    return;
  }

  if (command === 'check') {
    const client = connect();
    const scopes = await client.scopes();
    const missing = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
    console.log(`Signed in to ${client.shop}`);
    console.log(missing.length ? `Missing access: ${missing.join(', ')}` : 'The app has the access it needs.');
    for (const theme of await client.themes()) {
      console.log(`  theme ${theme.id.split('/').pop()}  ${theme.role === 'MAIN' ? 'published' : 'not published'}  ${theme.name}`);
    }
    return;
  }

  if (command === 'publish') {
    const page = loadBrief(briefFile, { requireHttpsImages: true });
    noteRemoteImages(page);
    await publish(connect(), page, buildTemplate(page), {
      theme: values.theme,
      assign: values.assign,
      overwrite: values.overwrite,
      dryRun: values['dry-run'],
    });
    return;
  }

  fail(`unknown command "${command}"\n\n${HELP}`);
}

main().catch((error) => fail(error.message));
