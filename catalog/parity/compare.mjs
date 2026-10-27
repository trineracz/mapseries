// Compare a candidate run against the oracle run.
//   node compare.mjs out/<oracle> out/<candidate>
// Text (clipboard output), dialog DOM and screenshots must match exactly;
// differing screenshots get a highlighted diff image in <candidate>/diff/.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [oracleDir, candDir] = process.argv.slice(2);
const load = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
const oracle = load(oracleDir);
const cand = load(candDir);
const normDom = (s) => s && s.replace(/ id="(:[0-9a-z]+|goog_[0-9]+)"/g, '')
  .replace(/ aria-(labelledby|activedescendant)="[^"]*"/g, '');

let problems = 0;
let checked = 0;
const report = (msg) => { problems++; if (problems <= (Number(process.env.MAX_REPORT) || 60)) console.log(msg); };

const candSeries = new Map(cand.series.map((s) => [s.layer, s]));
for (const os of oracle.series) {
  const cs = candSeries.get(os.layer);
  if (!cs) { report(`MISSING series ${os.layer}`); continue; }
  os.sheets.forEach((osh, i) => {
    const csh = cs.sheets[i];
    if (!csh) { report(`MISSING sheet ${os.layer}#${i}`); return; }
    if (JSON.stringify(osh.combos) !== JSON.stringify(csh.combos)) report(`COMBOS differ ${os.layer}#${i}`);
    for (const k of Object.keys(osh.dom || {})) {
      checked++;
      if (normDom(osh.dom[k]) !== normDom((csh.dom || {})[k])) report(`DOM differs ${os.layer}#${i} [${k}]`);
    }
    // key = action + occurrence (a template may list the same option twice)
    const keyed = (states) => {
      const seen = {};
      return states.map((s) => [s.action + ' #' + (seen[s.action] = (seen[s.action] || 0) + 1), s]);
    };
    const cstates = new Map(keyed(csh.states));
    for (const [key, ost] of keyed(osh.states)) {
      checked++;
      const cst = cstates.get(key);
      if (!cst) { report(`MISSING state ${os.layer}#${i} ${ost.action}`); continue; }
      const a = JSON.stringify([ost.hidden, ost.dialog, ost.out]);
      const b = JSON.stringify([cst.hidden, cst.dialog, cst.out]);
      if (a !== b) {
        let detail = '';
        for (const f of ['aleph', 'arl', 'f008']) {
          const x = ((ost.out || {})[f] || '').split('\n');
          const y = ((cst.out || {})[f] || '').split('\n');
          const j = x.findIndex((l, n) => l !== y[n]);
          if (j >= 0) { detail = `\n     ${f} line ${j}:\n     old: ${x[j]}\n     new: ${y[j]}`; break; }
        }
        if (!detail) detail = `\n     old: ${a.slice(0, 200)}\n     new: ${b.slice(0, 200)}`;
        report(`OUTPUT differs ${os.layer}#${i} ${ost.action}${detail}`);
      }
    }
  });
}
if ((cand.pageErrors || []).length) report(`PAGE ERRORS in candidate: ${cand.pageErrors.join(' | ')}`);

// screenshots
const shotsDir = path.join(oracleDir, 'shots');
let shots = 0;
if (fs.existsSync(shotsDir)) {
  fs.mkdirSync(path.join(candDir, 'diff'), { recursive: true });
  for (const f of fs.readdirSync(shotsDir).filter((x) => x.endsWith('.png'))) {
    shots++;
    const cf = path.join(candDir, 'shots', f);
    if (!fs.existsSync(cf)) { report(`MISSING screenshot ${f}`); continue; }
    const a = PNG.sync.read(fs.readFileSync(path.join(shotsDir, f)));
    const b = PNG.sync.read(fs.readFileSync(cf));
    if (a.width !== b.width || a.height !== b.height) {
      report(`SCREENSHOT size differs ${f}: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
      continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
    if (n > 0) {
      fs.writeFileSync(path.join(candDir, 'diff', f), PNG.sync.write(diff));
      report(`SCREENSHOT differs ${f}: ${n} px`);
    }
  }
}

console.log(`\nchecked ${checked} states/DOM snapshots and ${shots} screenshots: ` +
  (problems ? `${problems} difference(s)` : 'IDENTICAL'));
process.exit(problems ? 1 : 0);
