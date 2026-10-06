/**
 * Auditoria de SEGUNDO FATOR.
 *
 * O bug P0 de `criarClienteFiado` foi: o servidor exige `senhaMestra`
 * (verificarSenhaMestra) e o front nao enviava. Nenhum gate pegava isso.
 *
 * Esta checagem lista todo callable que exige senha mestra no servidor e
 * confronta com os call sites: se algum nao envia, a operacao quebra 100%
 * das vezes em producao.
 */
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, extname } = require('node:path');

const RAIZ = process.cwd();
const SERVER = join(RAIZ, 'functions', 'index.js');
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

const serverSrc = readFileSync(SERVER, 'utf8');

/**
 * Recorta o corpo de cada `exports.X = onCall(...)` ate a chave de
 * fechamento CORRESPONDENTE.
 *
 * Importante: nao usar fatia de tamanho fixo. Um slice de N caracteres
 * atravessa o fechamento da funcao e pega o `verificarSenhaMestra` da
 * funcao seguinte, produzindo falso positivo.
 */
const { corpoDoCallable } = require('./lib-corpo-callable.cjs');

/** Recorta o corpo real (após o `=>`) de cada callable. */
function corpos() {
  const out = new Map();
  const re = /exports\.([A-Za-z0-9_]+)\s*=\s*onCall\(/g;
  let m;
  while ((m = re.exec(serverSrc))) {
    const corpo = corpoDoCallable(serverSrc, m.index);
    if (!corpo) continue;
    out.set(m[1], { linha: serverSrc.slice(0, m.index).split('\n').length, corpo });
  }
  return out;
}

const porFuncao = corpos();

/**
 * Classifica um callable em:
 *  - OBRIGATORIA: verificarSenhaMestra fora de qualquer `if` (roda sempre).
 *  - CONDICIONAL: a verificacao esta dentro de um `if` (ex.: so admin).
 *
 * A distincao importa: em `gerenciarSessaoCaixa` a senha e exigida apenas
 * para admin completo, entao o call site do VENDEDOR legitimately nao envia.
 * Exigir la seria falso positivo.
 */
function classificarSenha(corpo) {
  const re = /verificar(?:Dupla)?SenhaMestra\s*\(\s*request/g;
  let m;
  let condicional = false;
  let encontrou = false;
  while ((m = re.exec(corpo))) {
    encontrou = true;
    // conta o desbalanceamento de chaves ate a chamada: dentro do `if` => { ... }
    let depth = 0;
    for (let i = m.index - 1; i >= 0; i--) {
      const c = corpo[i];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) {
          // este `{` abre um bloco; procura o `if` logo antes
          const antes = corpo.slice(Math.max(0, i - 160), i);
          // `[^)]*` nao serve: a condicao pode ter parenteses aninhados
          // (ex.: `if (ehAdminCompleto(caller))`). [\s\S]* com backtracking
          // casa ate o ULTIMO ')' antes do '{', que e o da propria condicao.
          if (/\bif\s*\([\s\S]{0,150}\)\s*$/.test(antes)) { condicional = true; }
          break;
        }
        depth--;
      }
    }
  }
  if (!encontrou) return null;
  return condicional ? 'CONDICIONAL' : 'OBRIGATORIA';
}

const obrigatorias = [];
const condicionais = [];
for (const [nome, info] of porFuncao) {
  const r = classificarSenha(info.corpo);
  if (r === 'OBRIGATORIA') obrigatorias.push(nome);
  else if (r === 'CONDICIONAL') condicionais.push(nome);
}

// Resolve cada invocacao `VAR(` para o callable da ATRIBUICAO MAIS PROXIMA
// ANTERIOR de `VAR = httpsCallable(..., 'nome')`.
//
// Sem isso ha falso positivo: `fn` e reusado em varias funcoes do mesmo
// arquivo e `fn({...})` seria atribuido ao callable declarado antes, longe.
const ARG = String.raw`[A-Za-z0-9_$.]+\s*(?:\(\s*\))?`;
const RE_CALL = new RegExp(String.raw`httpsCallable\s*\(\s*${ARG}\s*,\s*(['"\`])([A-Za-z0-9_]+)\1`, 'g');

const sites = new Map(); // nome -> [{arquivo, linha, usaSenha}]

for (const file of walk(RAIZ)) {
  const src = readFileSync(file, 'utf8');

  // todas as definicoes: varavel -> {nome, pos}
  const defs = [];
  for (const m of src.matchAll(RE_CALL)) {
    const antes = src.slice(Math.max(0, m.index - 200), m.index);
    const vm = antes.match(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*$/);
    if (vm) defs.push({ var: vm[1], nome: m[2], pos: m.index });
  }

  // todas as invocacoes `VAR({`
  const usos = [];
  for (const m of src.matchAll(/([A-Za-z0-9_$]+)\s*\(\s*\{/g)) {
    const nomeVar = m[1];
    // atribuicao mais proxima ANTERIOR a esta invocacao
    let melhor = null;
    for (const d of defs) {
      if (d.var !== nomeVar) continue;
      if (d.pos < m.index && (!melhor || d.pos > melhor.pos)) melhor = d;
    }
    if (!melhor) continue;

    const ini = m.index + m[0].length - 1;
    let depth = 0, fim = ini;
    for (let i = ini; i < Math.min(src.length, ini + 1500); i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { fim = i; break; } }
    }
    const payload = src.slice(ini, fim + 1);
    // aceita `senhaMestra: x` e o shorthand `{ senhaMestra }`
    const usaSenha = /\bsenhaMestra\b\s*[:}]/.test(payload);
    if (!sites.has(melhor.nome)) sites.set(melhor.nome, []);
    sites.get(melhor.nome).push({
      arquivo: file.replace(RAIZ + '\\', ''),
      linha: src.slice(0, m.index).split('\n').length,
      usaSenha,
    });
  }
}

console.log('=== SEGUNDO FATOR (senha mestra) ===');
console.log(`exigem senha mestra SEMPRE: ${obrigatorias.length}`);
obrigatorias.forEach(n => console.log('  - ' + n));
if (condicionais.length) {
  console.log(`exigem senha mestra SO PARA ADMIN (condicional): ${condicionais.length}`);
  condicionais.forEach(n => console.log('  - ' + n));
}
console.log('');

const suspicious = [];
for (const nome of obrigatorias) {
  const lista = sites.get(nome);
  if (!lista || !lista.length) {
    suspicious.push({ nome, motivo: 'NAO CHAMADO PELO FRONT', site: null });
    continue;
  }
  for (const s of lista) {
    if (!s.usaSenha) {
      suspicious.push({ nome, motivo: 'INVOCACAO SEM senhaMestra', site: `${s.arquivo}:${s.linha}` });
    }
  }
}

if (suspicious.length) {
  console.log('!!! CALLSITE SEM SENHA MESTRA (quebra em producao) !!!');
  for (const s of suspicious) {
    console.log(`  ${s.nome}: ${s.motivo}${s.site ? `  <- ${s.site}` : ''}`);
  }
} else {
  console.log('OK: todo call site de callable protegido envia a senha mestra.');
}

process.exit(suspicious.length ? 1 : 0);
