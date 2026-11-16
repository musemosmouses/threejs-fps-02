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

import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The grader runs this program twice into the same /output. The first
// run's cpSync preserves the source directory's mode, so when the source
// is read-only the copied tree is read-only too and the second run's
// cpSync into it fails EACCES. Clear each destination first: walk it,
// make every entry writable, then remove it, so every run starts clean.
function clearDir(dir: string): void {
  if (!existsSync(dir)) return;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const p = stack.pop()!;
    const st = lstatSync(p);
    if (st.isDirectory()) { chmodSync(p, 0o755); for (const e of readdirSync(p)) stack.push(join(p, e)); }
    else chmodSync(p, 0o644);
  }
  rmSync(dir, { recursive: true, force: true });
}

// The grader rejects any output path that is not a plain relative name: a
// name must start with a letter, a digit or _ and hold only letters,
// digits, . _ and -. Dotfiles break that rule, and the repo snapshot the
// grader runs on carries several (e.g. .gitkeep left by the repo's folder
// setup, .DS_Store) — so never copy one into the output, whatever the
// snapshot holds.
function skipDotfiles(src: string): boolean {
  return !basename(src).startsWith('.');
}

mkdirSync(out, { recursive: true });
clearDir(join(out, 'game'));
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true, filter: skipDotfiles });
clearDir(join(out, 'screenshots'));
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true, filter: skipDotfiles });
}

// The scorer's caps, from the competition's gate: the text cap shapes
// how much source the judge reads; the others refuse an entry the
// scorer would refuse (more than 4 screenshots, one over 256 KiB, or
// more than 993 files / 48 MiB of game files in total).
rmSync(join(out, 'dossier.json'), { force: true });
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
