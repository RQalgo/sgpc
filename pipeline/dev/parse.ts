import { parseProduct, sectionCategory } from '../lib/normalise.ts';
const [label, section = '', capacity] = process.argv.slice(2);
console.log('section ->', sectionCategory(section));
console.log(JSON.stringify(parseProduct(label, { section, capacity })));
