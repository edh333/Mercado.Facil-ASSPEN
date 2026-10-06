/**
 * Auditoria de contrato cliente<->servidor.
 *
 * Cada callable carrilado no front precisa:
 *  - existir em functions/index.js
 *  - receber os parametros que o front envia
 *
 * Esta e a classe de bug que NAO aparece em lint/test/build: o codigo
 * compila, o deploy passa, e a operacao so quebra em producao.
 */
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, extname } = require('node:path');

const RAIZ = process.cwd();
const APP = RAIZ;
const SERVER = join(RAIZ, 'functions', 'index.js');

// O app fica na raiz do projeto (App.tsx, firebase.ts, components/, utils/...).
// Ignora build/, node_modules/, functions/ e tests/ para não gerar falso positivo.
const IGNORAR = new Set(['node_modules', 'build', 'dist', 'functions', 'tests', 'scripts', '.git', 'public']);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORAR.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.ts', '.tsx'].includes(extname(p))) acc.push(p);
  }
  return acc;
}

/** exported X = onCall(...) */
const serverSrc = readFileSync(SERVER, 'utf8');
const exportados = new Set();
for (const m of serverSrc.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)) exportados.add(m[1]);

const called = [];

// Padrões reais no projeto:
//   httpsCallable(getFunctions(), 'nome')   <- com parênteses
//   httpsCallable(functions, 'nome')        <- sem parênteses
const ARG = String.raw`[A-Za-z0-9_$.]+\s*(?:\(\s*\))?`;
const RE_CALL = new RegExp(String.raw`httpsCallable\s*\(\s*${ARG}\s*,\s*(['"\`])([A-Za-z0-9_]+)\1`, 'g');

for (const file of walk(APP)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(RE_CALL)) {
    const linha = src.slice(0, m.index).split('\n').length;
    called.push({ arquivo: file, nome: m[2], linha });
  }
}



const nomesUnicos = [...new Set(called.map(c => c.nome))].sort();
const inexistentes = nomesUnicos.filter(n => !exportados.has(n));
const nuncaChamados = [...exportados].filter(n => !nomesUnicos.includes(n)).sort();

console.log('=== CONTRATO CLIENTE <-> SERVIDOR ===');
console.log(`callables exportados no servidor : ${exportados.size}`);
console.log(`callables chamados no front      : ${nomesUnicos.length}`);
console.log(`total de call sites no front     : ${called.length}`);
console.log('');

if (inexistentes.length) {
  console.log('!!! CHAMADOS NO FRONT MAS NAO EXISTEM NO SERVIDOR (quebram em producao) !!!');
  for (const n of inexistentes) {
    const sites = called.filter(c => c.nome === n);
    for (const s of sites) console.log(`  ${n}  <- ${s.arquivo.replace(RAIZ + '\\', '')}:${s.linha}`);
  }
} else {
  console.log('OK: todo callable chamado no front existe no servidor.');
}
console.log('');

console.log('exportados no servidor mas nunca chamados pelo front:');
console.log('  ' + (nuncaChamados.join(', ') || '(nenhum)'));
console.log('');

// Chamadas cujo nome nao e literal (variavel) nao sao verificaveis aqui.
const dinamicos = [];
for (const file of walk(APP)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(new RegExp(String.raw`httpsCallable\s*\(\s*${ARG}\s*,([^)]*)\)`, 'g'))) {
    if (!/^\s*(['"`])[A-Za-z0-9_]+\1\s*$/.test(m[1])) {
      const linha = src.slice(0, m.index).split('\n').length;
      dinamicos.push(`${file.replace(RAIZ + '\\', '')}:${linha}  ->  httpsCallable(x,${m[1].replace(/\s+/g, ' ')})`);
    }
  }
}
if (dinamicos.length) {
  console.log('ATENCAO: chamadas com nome dinamico (nao verificaveis estaticamente) - revisar:');
  for (const d of dinamicos) console.log('  ' + d);
}

process.exit(inexistentes.length ? 1 : 0);
