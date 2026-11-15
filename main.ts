// CINDERGATE — a three.js tactical FPS, entry for threejs-fps-02.
// Node 22, standard library only. The program is this directory's game/
// folder (plain static files, ES modules, three.js from the import map)
// plus screenshots/. Running this file copies both into the output
// directory and writes dossier.json there with the vendored make.fun
// helper, which is the summary the judge reads.
//
// Serve the game locally first to play it in a browser:
//   node serve.mjs        (then open http://localhost:8080)
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps, from the competition's gate: the text cap shapes
// how much source the judge reads; the others refuse an entry the
// scorer would refuse (more than 4 screenshots, one over 256 KiB, or
// more than 993 files / 48 MiB of game files in total).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

console.log(`CINDERGATE packaged into ${out}`);
