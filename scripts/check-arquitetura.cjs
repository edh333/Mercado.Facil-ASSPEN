/**
 * Mapa de organizacao do projeto:
 *  - arquivos ORFAOS (nenhum modulo os importa) = codigo morto no repo
 *  - arquivos NAO ALCANCAVEIS a partir da entry (nao vao para o bundle)
 *  - ciclos de importacao (podem causing hooks undefined / TDZ)
 *  - fan-in alto (god modules que concentrao responsabilidade)
 *
 * Uso: node scripts/check-arquitetura.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = ['.ts', '.tsx'];

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (['node_modules', 'build', 'dist', 'portable', 'release', '.git', 'coverage', 'functions'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (EXT.includes(path.extname(e.name))) acc.push(full);
  }
  return acc;
}

const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

/** resolve um especificador relativo para um arquivo do projeto */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try {
      if (fs.statSync(cand).isFile()) return cand;
    } catch { /* segue */ }
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// ATENCAO: o Vite tem DUAS entradas (vite.config.ts -> rollupOptions.input):
// index.html -> index.tsx  e  print.html -> print.tsx.
// O print.tsx NAO e codigo morto: e o entry da pagina de impressao. Tratar
// apenas index.tsx como entry faz o analisador acusar FALSAMENTE o modulo de
// impressao como orfao -- e apagar isso quebraria a impressao em producao.
// As entradas sao derivadas dos <script type="module"> dos .html.
const ENTRIES_FROM_HTML = [];
for (const page of ['index.html', 'print.html']) {
  try {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="\/([^"]+)"/g)) {
      const spec = m[1].replace(/\?.*$/, '');
      const r = resolveSpec(path.join(ROOT, page), './' + spec);
      if (r) ENTRIES_FROM_HTML.push(r);
    }
  } catch { /* pagina ausente */ }
}
const ENTRY = ['index.tsx', 'main.tsx', 'index.ts'];
const isEntry = (f) => ENTRY.includes(path.basename(f)) || ENTRIES_FROM_HTML.includes(f);
if (!ENTRIES_FROM_HTML.some((f) => path.basename(f) === 'print.tsx')) {
  console.log('AVISO: print.html nao resolveu para um modulo do projeto; a ' +
    'deteccao de codigo morto pode acusar o entry de impressao como orfao.');
}

const graph = new Map();     // file -> Set(imports)
const importedBy = new Map(); // file -> Set(importers)
const isTest = (f) => f.includes(`${path.sep}tests${path.sep}`) || /\.test\.[tj]sx?$/.test(f);

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const deps = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1] || m[2];
    const r = resolveSpec(f, spec);
    if (r) deps.add(r);
  }
  graph.set(f, deps);
  for (const d of deps) {
    if (!importedBy.has(d)) importedBy.set(d, new Set());
    importedBy.get(d).add(f);
  }
}

// --- alcancavel a partir das entries
const reachable = new Set();
const stack = files.filter(isEntry);
while (stack.length) {
  const f = stack.pop();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const d of graph.get(f) || []) if (!reachable.has(d)) stack.push(d);
}

const appFiles = files.filter((f) => !isTest(f) && !rel(f).startsWith('scripts/'));
// .d.ts nao e codigo executavel: e declaracao de tipos (electron.d.ts etc).
const notConfig = (f) => !rel(f).includes('vite.config') && !rel(f).includes('vitest.config') && !rel(f).includes('sw.js') && !f.endsWith('.d.ts');
// ORFAO = nao importado por ninguem E nao alcancavel de nenhuma entry.
// O segundo criterio e o que protege o print.tsx (entry) de ser accusado.
const orphans = appFiles.filter((f) => !importedBy.has(f) && !isEntry(f) && !reachable.has(f) && notConfig(f));
const inBundleButUnimported = appFiles.filter((f) => !importedBy.has(f) && !isEntry(f) && notConfig(f) && !orphans.includes(f));

// --- ciclos
const cycles = [];
const state = new Map();
function dfs(f, stack) {
  if (state.get(f) === 1) {
    const i = stack.indexOf(f);
    cycles.push([...stack.slice(i), f]);
    return;
  }
  if (state.get(f) === 2) return;
  state.set(f, 1);
  stack.push(f);
  for (const d of graph.get(f) || []) dfs(d, stack);
  stack.pop();
  state.set(f, 2);
}
for (const f of appFiles) if (!state.get(f)) dfs(f, []);

const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).length; } catch { return 0; } };

console.log(`Arquivos .ts/.tsx no projeto: ${files.length} (app: ${appFiles.length})`);
console.log(`Entries detectadas: ${[...files.filter(isEntry)].map(rel).join(', ')}`);
console.log(`Alcancaveis das entries: ${[...reachable].length}`);

console.log(`\n=== CODIGO MORPHO (nenhum importa E nenhuma entry alcanca) ===`);
if (!orphans.length) console.log('  (nenhum)');
for (const f of orphans.sort((a, b) => lines(b) - lines(a))) {
  console.log(`  ${rel(f)}  — ${lines(f)} linhas, ${Math.round(fs.statSync(f).size / 1024)} kB`);
}
const deadBytes = orphans.reduce((a, f) => a + fs.statSync(f).size, 0);
console.log(`  TOTAL: ${orphans.length} arquivos, ${Math.round(deadBytes / 1024)} kB`);

if (inBundleButUnimported.length) {
  console.log('\n=== NAO IMPORTADOS MAS ALCANCAVEIS (revise: podem ser entry旁 ou uso dinamico) ===');
  for (const f of inBundleButUnimported) console.log(`  ${rel(f)}`);
}

console.log(`\n=== CICLOS DE IMPORTACAO ===`);
const uniqCycles = [];
const seen = new Set();
for (const c of cycles) {
  const key = c.slice(0, -1).map(rel).sort().join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  uniqCycles.push(c);
}
if (!uniqCycles.length) console.log('  (nenhum)');
for (const c of uniqCycles.slice(0, 15)) console.log('  ' + c.map(rel).join(' -> '));

// CICLOS sao o unico item que vira FALHA: eles quebram a ordem de inicializacao
// de modulos e ja produziram "Invalid hook call" / TDZ no projeto. O resto e
// informativo (codigo morto e modulos gigantes sao debt, nao bug).
if (uniqCycles.length) {
  console.error(`\nFALHA: ${uniqCycles.length} ciclo(s) de importacao. Quebre-os antes de mergulhar.`);
  process.exitCode = 1;
}

console.log(`\n=== FAN-IN (modulos mais importados = risco de mudanca) ===`);
const fanIn = appFiles.map((f) => [f, (importedBy.get(f) || new Set()).size]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
for (const [f, n] of fanIn.slice(0, 10)) console.log(`  ${String(n).padStart(3)} importadores  ${rel(f)}  (${lines(f)} linhas)`);

console.log(`\n=== ARQUIVOS GIGANTES (>800 linhas) ===`);
for (const f of appFiles.filter((f) => lines(f) > 800).sort((a, b) => lines(b) - lines(a))) {
  console.log(`  ${String(lines(f)).padStart(5)} linhas  ${rel(f)}`);
}