import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

export const examplePage = () => read('insulated-bottle.en.json');
export const sampleStore = () => read('sample-product.json');
