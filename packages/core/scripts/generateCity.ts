import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CITY_PLAN, CITY_ZONES } from '../src/maps/cityPlan';
import { planToTiled } from './planToTiled';

/** Schreibt `src/maps/city.tiled.json` aus dem Stadtplan. Aufruf: `npx tsx packages/core/scripts/generateCity.ts` */
const out = fileURLToPath(new URL('../src/maps/city.tiled.json', import.meta.url));
writeFileSync(out, JSON.stringify(planToTiled(CITY_PLAN, CITY_ZONES), null, 1) + '\n');
console.log(`wrote ${out}`);
