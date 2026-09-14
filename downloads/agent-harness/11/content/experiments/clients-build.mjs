import {build} from '../research/repos/pi/node_modules/esbuild/lib/main.js';
await build({entryPoints:['experiments/clients-lab.ts'],outfile:'experiments/clients-lab.mjs',bundle:true,format:'esm',platform:'node',target:'node22'});
