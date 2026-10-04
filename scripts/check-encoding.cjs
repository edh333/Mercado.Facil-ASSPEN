/**
 * Detecta MOJIBAKE (texto UTF-8 reinterpretado como outra codificacao) nos
 * arquivos de texto do projeto. Frases quebradas em tela (acentos como "ǜ",
 * "�", "Ô", "Ǹ") sao erro de entrega, nao estilo.
 *
 * O PowerShell 5.1 com `Set-Content -Encoding utf8` reconverteu arquivos varias
 * vezes durante uma edicao e destruiu os acentos. Este script barra a regressao.
 *
 * Uso: node scripts/check-encoding.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.css', '.html', '.bat', '.md']);
const SKIP = new Set([
  'node_modules', 'build', 'dist', 'dist-electron', 'coverage', '.git', 'portable', 'release',
  'functions\\node_modules',
]);
// este proprio arquivo documenta as assinaturas de mojibake
const SELF = path.basename(__filename);

// Assinaturas INAMBIGUAS de mojibake. Acentos PT legitimos (ã, ç, õ, â, é, É)
// NAO sao mojibake; o que caracteriza e a sequencia: byte UTF-8 de um acento
// reinterpretado como Windows-1252/CP850 -> vira letra + caractere C1.
const SIGNS = [
  { name: 'replacement char U+FFFD', re: /\uFFFD/ },
  { name: 'controle C1 (0x80-0x9F)', re: /[\u0080-\u009F]/ },
  // "Ã" + pontuacao latin-1 => Ã©, Ã£, Ãµ (m, ~, $ com acento perdidos)
  { name: 'A-til + latin1 punct', re: /\u00C3[\u0080-\u00BF]/ },
  // "Â" + pontuacao latin-1 => Â€, Â©
  { name: 'A-circumflex + latin1 punct', re: /\u00C2[\u0080-\u00BF]/ },
  // "â€" / "â€™" / "â€œ" (apostrophe/aspas/emoji viraram latin1)
  { name: 'a-circumflex + euro/ornaments', re: /\u00E2[\u0080-\u00BF\u20AC\u2122\u0160\u0152\u017D\u017E\u0178\u0179]/ },
  // "Ô" + C1 (em-dash -> ÔÇ) e cedilha virando "ǜ"/"Ǹ"
  { name: 'O-circumflex + C1 (em-dash)', re: /\u00D4[\u0080-\u00BF]/ },
  { name: 'cedilha/tilda em CP850 (ǜ Ǹ)', re: /[\u01DC\u01F8\u01F9\u01BD]/ },
  // caixinha de desenho com lixo (ÔöÇÔöÇ dos separadores de comentário)
  { name: 'separador de comentario corrompido', re: /\u00D4[\u00F6\u00E7]\u00D4[\u00F6\u00E7]/ },
];

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    if (e.name === SELF) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (EXT.has(path.extname(e.name)) && !full.includes(`${path.sep}functions${path.sep}node_modules${path.sep}`)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(ROOT, []);
const hits = [];

for (const f of files) {
  const buf = fs.readFileSync(f);
  const rel = path.relative(ROOT, f);

  // BOM UTF-8 no inicio de .ts/.tsx/.js atrapalha o parser do TypeScript
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    hits.push({ rel, line: 1, why: 'BOM UTF-8 no inicio do arquivo' });
  }

  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    // Comentario que DOCUMENTA o mojibake de proposito (explica o bug do Excel).
    if (/check-encoding-ignore/.test(l)) continue;
    for (const s of SIGNS) {
      if (s.re.test(l)) {
        hits.push({ rel, line: i + 1, why: s.name, sample: l.trim().slice(0, 90) });
        break;
      }
    }
  }
}

console.log(`Arquivos analisados: ${files.length}`);
if (!hits.length) {
  console.log('OK: nenhum mojibake e nenhuma BOM encontrados.');
  process.exit(0);
}
console.log(`\nARQUIVOS COM TEXTO CORROMPIDO: ${new Set(hits.map((h) => h.rel)).size} (${hits.length} linhas)`);
const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.rel)) byFile.set(h.rel, []);
  byFile.get(h.rel).push(h);
}
for (const [rel, list] of byFile) {
  console.log(`\n  ${rel}  (${list.length})`);
  for (const h of list.slice(0, 6)) {
    console.log(`    L${h.line}: [${h.why}] ${h.sample || ''}`);
  }
  if (list.length > 6) console.log(`    ... +${list.length - 6} mais`);
}
process.exit(1);