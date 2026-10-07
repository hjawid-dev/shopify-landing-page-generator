/* A small client for the parts of the Shopify Admin GraphQL API the tool needs.
   The app must be installed on the store with these access scopes: */

export const REQUIRED_SCOPES = ['read_themes', 'write_themes', 'read_products', 'write_products'];

const DEFAULT_API_VERSION = '2026-07';

const QUERIES = {
  scopes: `query Scopes { currentAppInstallation { accessScopes { handle } } }`,
  themes: `query Themes { themes(first: 50) { nodes { id name role } } }`,
  themeFile: `query ThemeFile($themeId: ID!, $filenames: [String!]!) {
    theme(id: $themeId) { id name role files(filenames: $filenames, first: 1) { nodes { filename } } }
  }`,
  product: `query ProductByHandle($handle: String!) {
    productByIdentifier(identifier: {handle: $handle}) { id handle templateSuffix }
  }`,
  upload: `mutation UploadTemplate($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`,
  assign: `mutation AssignTemplate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id templateSuffix }
      userErrors { field message }
    }
  }`,
};

/** Reads the store settings from the environment and checks them before anything is sent. */
export function configFromEnv(env = process.env) {
  const missing = ['SHOPIFY_SHOP', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'].filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`);
  return {
    shop: env.SHOPIFY_SHOP,
    clientId: env.SHOPIFY_CLIENT_ID,
    clientSecret: env.SHOPIFY_CLIENT_SECRET,
    apiVersion: env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION,
  };
}

export function createClient({ shop, clientId, clientSecret, apiVersion = DEFAULT_API_VERSION, fetch = globalThis.fetch }) {
  // The client secret is only ever sent to a Shopify store address.
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error('SHOPIFY_SHOP must look like your-store.myshopify.com');
  }
  let token;

  async function getToken() {
    if (token) return token;
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    if (!response.ok) {
      const body = await response.text();
      const hint = body.includes('app_not_installed') ? ' The app is not installed on this store.' : '';
      throw new Error(`Could not sign in to the store (HTTP ${response.status}).${hint}`);
    }
    token = (await response.json()).access_token;
    return token;
  }

  async function graphql(query, variables = {}) {
    const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`Shopify answered HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(`Shopify rejected the request: ${payload.errors.map((error) => error.message).join('; ')}`);
    return payload.data;
  }

  function failOnUserErrors(result) {
    if (result.userErrors?.length) throw new Error(result.userErrors.map((error) => error.message).join('; '));
    return result;
  }

  return {
    shop,

    async scopes() {
      const data = await graphql(QUERIES.scopes);
      return data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
    },

    async themes() {
      return (await graphql(QUERIES.themes)).themes.nodes;
    },

    /** The theme and whether it already contains the file. Null when the theme does not exist. */
    async themeFile(themeId, filename) {
      const { theme } = await graphql(QUERIES.themeFile, { themeId, filenames: [filename] });
      if (!theme) return null;
      return { id: theme.id, name: theme.name, role: theme.role, fileExists: theme.files.nodes.length > 0 };
    },

    async product(handle) {
      return (await graphql(QUERIES.product, { handle })).productByIdentifier;
    },

    async uploadTemplate(themeId, filename, body) {
      const data = await graphql(QUERIES.upload, { themeId, files: [{ filename, body: { type: 'TEXT', value: body } }] });
      failOnUserErrors(data.themeFilesUpsert);
    },

    async assignTemplate(productId, templateSuffix) {
      const data = await graphql(QUERIES.assign, { product: { id: productId, templateSuffix } });
      failOnUserErrors(data.productUpdate);
    },
  };
}
