/**
 * Auditoria de regras x escritas do cliente.
 *
 * Se o client escreve em uma colecao que as firestore.rules proibem
 * (`allow write: if false` / `create: if false`), a operacao quebra em
 * producao com PERMISSION_DENIED - e nada no lint/test/build acusa,
 * porque o codigo esta correto, so a autorizacao que nao bate.
 */
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, extname } = require('node:path');

const RAIZ = process.cwd();
const IGNORAR = new Set(['node_modules', 'build', 'dist', 'functions', 'tests', 'scripts', '.git', 'public', 'ponto-restauracao', 'scratch']);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORAR.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.ts', '.tsx'].includes(extname(p))) acc.push(p);
  }
  return acc;
}

// ---------- 1. Colecoes com escrita PROIBIDA nas rules ----------
const rules = readFileSync(join(RAIZ, 'firestore.rules'), 'utf8');

/**
 * Extrai os blocos `match /caminho { ... }`.
 *
 * O caminho pode ser um literal de documento (`/settings/general`) ou um
 * curinga (`/users/{userId}`). Guardamos a chave completa para casar
 * com a colecao/documento que o cliente escreve.
 */
function colecoes() {
  const out = new Map();
  const re = /match\s*\/([A-Za-z0-9_\-/{}]+)\s*\{/g;
  let m;
  while ((m = re.exec(rules))) {
    const caminho = m[1];
    let i = m.index + m[0].length - 1;
    let depth = 0, ini = i;
    for (; i < rules.length; i++) {
      if (rules[i] === '{') depth++;
      else if (rules[i] === '}') { depth--; if (depth === 0) break; }
    }
    out.set(caminho, rules.slice(ini, i + 1));
  }
  return out;
}

const col = colecoes();

/**
 * Encontra o bloco que governa um caminho concreto do cliente.
 *
 * O cliente escreve tanto em colecao (`orders`) quanto em documento
 * (`settings/general`). A regra pode ser `orders/{orderId}` ou
 * `settings/general`. O casamento e por segmento, com curinga: um bloco
 * `a/b` governa o documento `a/b`, e `orders/{orderId}` governa qualquer
 * `orders/xyz` — logo tambem vale para a colecao `orders`.
 */
function blocoDe(caminho) {
  if (col.has(caminho)) return { caminho, texto: col.get(caminho) };
  const partes = caminho.split('/');
  let melhor = null;
  for (const [k, v] of col) {
    const kp = k.split('/');
    // o bloco precisa cobrir o caminho do cliente
    const casa = kp.every((seg, i) => seg.startsWith('{') || seg === partes[i]);
    if (!casa) continue;
    // o mais especifico (mais segmentos literais) vence
    if (!melhor || kp.length > melhor.caminho.split('/').length) melhor = { caminho: k, texto: v };
  }
  return melhor;
}

/**
 * Quais operacoes cada colecao PROIBE.
 *
 * Importante: `create: if false` bloqueia apenas criacao. `orders` e `users`
 * bloqueiam create (venda/cadastro via backend) mas PERMITEM update - tratar
 * a colecao inteira como bloqueada gera falso positivo em todo updateDoc.
 */
function opsProibidas(coll) {
  const b = blocoDe(coll);
  if (!b) return ['create', 'update', 'delete']; // sem regra => bloqueado
  const c = b.texto;
  const proibidas = new Set();

  for (const m of c.matchAll(/allow\s+([a-z,\s]+?)\s*:\s*if\s+([^;]+);/g)) {
    const ops = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const cond = m[2].trim();
    const efetivas = ops.includes('write') ? ['create', 'update', 'delete'] : ops;
    const negada = /^false\b/.test(cond) && !/\|\|/.test(cond);
    if (negada) efetivas.forEach(o => proibidas.add(o));
  }
  return [...proibidas];
}

const todosCaminhos = [...col.keys()].sort();
const BLOQUEADAS = todosCaminhos.filter(k => opsProibidas(k).length).sort();

console.log('=== REGRAS x ESCRITAS DO CLIENTE ===');
console.log('colecoes com alguma operacao proibida:');
BLOQUEADAS.forEach(k => console.log(`  ${k}   -> ${opsProibidas(k).join(', ')}`));
console.log('');

// ---------- 2. Escritas do cliente ----------
const ESCRITAS = /(setDoc|updateDoc|addDoc|deleteDoc)\s*\(/g;
const achados = [];

for (const file of walk(RAIZ)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(ESCRITAS)) {
    const linha = src.slice(0, m.index).split('\n').length;
    // pega a proxima colecao citada: doc(db, 'x'...) ou doc(db,'x')
    const janela = src.slice(m.index, m.index + 260);
    // `doc(db, 'settings')` ou `doc(db, 'settings', 'checklist')` — junta os segmentos
    const dm = janela.match(/doc\s*\(\s*db\s*((?:\s*,\s*['"`][A-Za-z0-9_/-]+['"`])+)/);
    if (!dm) continue;
    const coll = (dm[1].match(/['"`]([A-Za-z0-9_/-]+)['"`]/g) || [])
      .map(s => s.replace(/['"`]/g, ''))
      .join('/');
    if (!coll) continue;
    achados.push({ arquivo: file.replace(RAIZ + '\\', ''), linha, op: m[1], coll });
  }
  // writeBatch(db) + batch.update(doc(db,'x'))
  for (const m of src.matchAll(/batch\.(update|set|delete)\s*\(\s*doc\s*\(\s*db\s*,\s*['"`]([A-Za-z0-9_/]+)['"`]/g)) {
    achados.push({
      arquivo: file.replace(RAIZ + '\\', ''),
      linha: src.slice(0, m.index).split('\n').length,
      op: 'batch.' + m[1],
      coll: m[2],
    });
  }
}

/** setDoc cria OU sobrescreve; batch.set idem. Mapeia para a operacaoæ•ˆåº”iva. */
function opDe(nomeOp) {
  if (nomeOp === 'setDoc' || nomeOp === 'batch.set') return 'create'; // create-or-update
  if (nomeOp === 'addDoc') return 'create';
  if (nomeOp === 'updateDoc' || nomeOp === 'batch.update') return 'update';
  if (nomeOp === 'deleteDoc' || nomeOp === 'batch.delete') return 'delete';
  return null;
}

const violacoes = achados
  .map(a => ({ ...a, proibida: opsProibidas(a.coll) }))
  .filter(a => {
    const op = opDe(a.op);
    return op && a.proibida.includes(op);
  });

// ignora auditoria explicita em comentario
const reais = violacoes.filter(v => {
  const linhas = require('node:fs').readFileSync(join(RAIZ, v.arquivo), 'utf8').split('\n');
  const ctx = (linhas[v.linha - 1] || '') + (linhas[v.linha - 2] || '') + (linhas[v.linha] || '');
  return !/proib|bloque|server|backend|admin SDK|sem servidor|fallback/i.test(ctx);
});

if (reais.length) {
  console.log('!!! CLIENTE ESCREVE EM COLECAO PROIBIDA (PERMISSION_DENIED em producao) !!!');
  for (const v of reais) {
    console.log(`  ${v.coll}  <- ${v.op}() em ${v.arquivo}:${v.linha}`);
  }
} else {
  console.log('OK: nenhuma escrita do cliente mira colecao bloqueada.');
}

console.log('');
console.log(`(escritas analisadas: ${achados.length}; bloqueadas: ${BLOQUEADAS.length})`);
process.exit(reais.length ? 1 : 0);
