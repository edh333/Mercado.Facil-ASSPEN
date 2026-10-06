#!/usr/bin/env node
/**
 * Gate: cobertura de indices compostos do Firestore.
 *
 * Uma query com 2+ filtros de igualdade e/ou igualdade+orderBy em campo
 * distinto exige indice composto. Sem ele o Firestore responde em PRODUCAO com
 * FAILED_PRECONDITION ("The query requires an index"), e o sintoma e uma tela
 * vazia ou um erro generico — o tipo de falha que so aparece depois do deploy.
 *
 * Regra implementada (espelha o comportamento do Firestore):
 *   - 0 filtros de igualdade + 0 orderBy  -> indice automatico (sem custo)
 *   - apenas igualdade em 1 campo         -> indice automatico
 *   - igualdade em >=2 campos             -> precisa indice composto
 *   - igualdade(1) + orderBy(outro campo) -> precisa indice composto
 *   - apenas orderBy (sem igualdade)      -> nao precisa (indice simples serve)
 *
 * Este gate e de ANALISE ESTATICA: ele varre os padroes de query e compara com
 * firestore.indexes.json. Falso positivo e possivel (queries sob `if` que nunca
 * rodam juntos) — por isso reporta em vez de reprovar. Ja localize os indices
 * realmente faltantes no deploy, entao divergencias sao revisadas a mao.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'firestore.indexes.json');

const IGNORE_DIRS = new Set(['node_modules', 'build', 'dist', '.git', 'coverage']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // functions/ É AUDITADO (o servidor tem queries que quebram igual), mas o
    // node_modules de dentro dele não. build/ e dist/ seguem de fora.
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Aceita as 3 formas de referenciar uma colecao no projeto:
//   v9 modular : collection(db, 'orders') | query(collection(db, 'x'), ...)
//   v8 compat  : db.collection('orders')
//   admin SDK  : admin.firestore().collection('orders')
// O trecho antes da string nao pode conter outra aspa (evita atravessar literais).
const RE_COLECAO = /\bcollection\(\s*[^'"]{0,80}['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\)/;

function isCollectionRef(expr) {
  return RE_COLECAO.test(expr);
}

/**
 * Extrai as queries de um trecho de codigo.
 * Para cada `collection('x')`, olha a janela seguinte ate o terminador da
 * query (.get / .onSnapshot) e coleta where/orderBy com operador de igualdade.
 */
function extrairQueries(codigo, arquivo) {
  const queries = [];
  const re = new RegExp(RE_COLECAO.source, 'g');
  let m;
  while ((m = re.exec(codigo)) !== null) {
    const colecao = m[1];
    const janela = codigo.slice(m.index, m.index + 900);

    // Corta no terminador: queries encadeadas depois nao pertencem a esta.
    // Encerra a janela no fim da query. `))` cobre a API modular, onde a query e
// `query(collection(...), where(...), ...)` envolvida em getDocs/getCountFromServer
// (o terminador getDocs vem ANTES do `collection`, entao nao serve de corte).
const corte = janela.search(/\)\s*\)|\.(?:get|onSnapshot|stream)\s*\(/);
    const corpo = corte > 0 ? janela.slice(0, corte) : janela;

    const wheres = [];
    // API modular: where(...) sem ponto. API compat: .where(...). O \b cobre as duas.
const reWhere = /\bwhere\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    let w;
    while ((w = reWhere.exec(corpo)) !== null) {
      const op = w[2].toLowerCase();
      // "array-contains"/"in" tambem sao igualdade multi-valor no indice
      const igualdade = op === '==' || op === 'array-contains' || op === 'in';
      wheres.push({ campo: w[1], op, igualdade });
    }

    const orderBys = [];
    const reOrder = /\borderBy\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/g;
    let o;
    while ((o = reOrder.exec(corpo)) !== null) {
      orderBys.push({ campo: o[1], dir: (o[2] || 'asc').toLowerCase() });
    }

    if (wheres.length === 0 && orderBys.length === 0) continue;

    // Chave de signature para deduplicar
    const sig = `${colecao}|${wheres
      .map((x) => `${x.campo}:${x.op}:${x.igualdade ? '=' : '!'}`)
      .sort()
      .join(',')}|${orderBys
      .map((x) => `${x.campo}:${x.dir}`)
      .sort()
      .join(',')}`;

    queries.push({ arquivo, linha: linhaDe(codigo, m.index), colecao, wheres, orderBys, sig });
  }
  return queries;
}

function linhaDe(codigo, idx) {
  return codigo.slice(0, idx).split('\n').length;
}

/**
 * A query exige indice COMPOSTO? (espelha o Firestore)
 *  - >=2 filtros de igualdade                     -> sim
 *  - 1 igualdade + orderBy em campo distinto      -> sim
 *  - so igualdade (1 campo) / so orderBy / nada  -> nao (indice automatico)
 */
function precisaIndiceComposto(q) {
  const iguais = q.wheres.filter((w) => w.igualdade);
  if (iguais.length >= 2) return true;
  if (iguais.length === 1 && q.orderBys.length >= 1) {
    return !q.orderBys.some((o) => o.campo === iguais[0].campo);
  }
  return false;
}

/**
 * Cobertura ESTRITA, conforme a regra real do Firestore:
 *  - os campos de igualdade formam um PREFIXO do indice (entre si a ordem e
 *    livre, porque igualdade nao restringe ordem);
 *  - os campos de orderBy vem em SEGUIDA, na mesma ordem da query e com a MESMA
 *    direcao (reversed/invertida e diferente e nao serve);
 *  - campos extras no indice depois disso sao tolerados (prefix matching).
 *
 * Um indice que so "contem" os campos, mas na ordem/direcao erradas, NAO
 * serve — e o Firestore responderia FAILED_PRECONDITION em producao.
 */
function indiceServe(ix, iguais, ordemComDir) {
  const campos = ix.campos;
  const nIg = iguais.length;
  if (nIg > 0) {
    const prefixo = campos.slice(0, nIg).map((c) => c.campo);
    if (iguais.some((c) => !prefixo.includes(c))) return false;
  }
  for (let i = 0; i < ordemComDir.length; i++) {
    const esperado = ordemComDir[i];
    const real = campos[nIg + i];
    if (!real) return false;
    if (real.campo !== esperado.campo) return false;
    if (real.dir !== esperado.dir) return false;
  }
  return true;
}

function assinaturaIndice(q) {
  // igualdade: ordem entre si e irrelevante (indiceServe compara como conjunto)
  const iguais = q.wheres
    .filter((w) => w.igualdade)
    .map((w) => w.campo);
  // orderBy: a ORDEM da query e a DIRECAO importam para casar com o indice
  const ordens = q.orderBys.map((o) => ({ campo: o.campo, dir: o.dir === 'desc' ? 'DESC' : 'ASC' }));
  return { iguais, ordens };
}

function main() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.log('AVISO: firestore.indexes.json ausente — cobertura nao verificavel.');
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const indices = (cfg.indexes || []).map((ix) => ({
    colecao: ix.collectionGroup,
    campos: (ix.fields || []).map((f) => ({
      campo: f.fieldPath,
      dir: f.arrayConfig ? 'ARRAY' : (f.order === 'DESCENDING' ? 'DESC' : 'ASC'),
    })),
  }));

  const arquivos = walk(ROOT);
  const todas = [];
  for (const arq of arquivos) {
    let codigo;
    try {
      codigo = fs.readFileSync(arq, 'utf8');
    } catch {
      continue;
    }
    if (!isCollectionRef(codigo)) continue;
    todas.push(...extrairQueries(codigo, path.relative(ROOT, arq)));
  }

  // dedup por assinatura
  const unicas = new Map();
  for (const q of todas) if (!unicas.has(q.sig)) unicas.set(q.sig, q);

  const total = todas.length;
  const complexas = [];
  for (const q of unicas.values()) {
    if (!precisaIndiceComposto(q)) continue;
    complexas.push(q);
  }

  const naoCobertos = [];
  for (const q of complexas) {
    const { iguais, ordens } = assinaturaIndice(q);
    const ok = indices.some((ix) => ix.colecao === q.colecao && indiceServe(ix, iguais, ordens));
    if (!ok) naoCobertos.push({ q, iguais, ordens });
  }

  console.log(`Analisadas ${total} queries em ${arquivos.length} arquivos; ${unicas.size} padroes unicos.`);
  console.log(`Queries que exigem indice composto: ${complexas.length}.`);
  console.log(`Indices declarados: ${indices.length}.`);

  if (naoCobertos.length === 0) {
    console.log('\nOK: nenhum padrao de query exige indice composto ausente.');
  }

  if (process.argv.includes('--verbose')) {
    console.log('\n--- padroes que exigem indice composto (verificados) ---');
    for (const q of complexas) {
      const { iguais, ordens } = assinaturaIndice(q);
      const partes = [];
      if (iguais.length) partes.push(`igualdade[${iguais.join(',')}]`);
      if (ordens.length) partes.push(`orderBy[${ordens.map((o) => o.campo + ':' + o.dir.toLowerCase()).join(',')}]`);
      const coberto = !naoCobertos.find((n) => n.q.sig === q.sig);
      console.log(`  [${coberto ? 'OK' : 'FALTA'}] ${q.colecao}: ${partes.join(' + ')}  @ ${q.arquivo}:${q.linha}`);
    }
  }

  console.log(`\n>>> ${naoCobertos.length} padrao(s) NAO cobertos por firestore.indexes.json:`);
  for (const { q, iguais, ordens } of naoCobertos) {
    const partes = [];
    if (iguais.length) partes.push(`igualdade[${iguais.join(',')}]`);
    if (ordens.length) partes.push(`orderBy[${ordens.join(',')}]`);
    console.log(`  - ${q.colecao}: ${partes.join(' + ')}  @ ${q.arquivo}:${q.linha}`);
  }
  console.log('\n(Acoes: para cada padrao acima, adicione um indice em firestore.indexes.json com os campos de igualdade ASCENDING seguidos dos de orderBy na direcao usada.)');
}

main();