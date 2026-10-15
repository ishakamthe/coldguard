// Quick sanity check of the demo engine: deterministic, expected seed ordering.
import E from '../src/lib/engine.js';
const run = () => E.UNITS.map((u) => { const a = E.assess(E.generateSeries(u.id), u); return [u.id, a.probability, a.category]; });
const a = run(), b = run();
console.table(a);
if (JSON.stringify(a) !== JSON.stringify(b)) { console.error('Non-deterministic output'); process.exit(1); }
const cat = Object.fromEntries(a.map(([id, , c]) => [id, c]));
if (cat['FR-02'] !== 'High' || cat['FR-03'] !== 'Medium' || cat['FR-01'] !== 'Low' || cat['CR-04'] !== 'Low') { console.error('Seed categories changed'); process.exit(1); }
console.log('engine ok');
