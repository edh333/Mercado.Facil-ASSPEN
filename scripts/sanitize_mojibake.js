/**
 * Sanitização de textos corrompidos por codificação dupla (mojibake)
 * em documentos já gravados no Firestore.
 *
 * Mesmo reparo aplicado ao código-fonte em `StoreContext.tsx`: decodifica
 * sequências duplo-codificadas (UTF-8 lido como CP1252 e re-salvo) para o
 * caractere original, preservando o texto que já estiver correto.
 *
 * Uso (raiz do projeto):
 *   node scripts/sanitize_mojibake.js                     # apenas inspeciona (dry-run)
 *   node scripts/sanitize_mojibake.js --apply             # grava as correções
 *   node scripts/sanitize_mojibake.js --key caminho.json  # service account
 *
 * Credenciais: `--key <arquivo>` OU variável GOOGLE_APPLICATION_CREDENTIALS.
 * Coleções verificadas: products, users, suppliers.
 */
'use strict';

const path = require('path');
const { createRequire } = require('module');

const functionsDir = path.resolve('functions', 'package.json');
const requireFunc = createRequire(functionsDir);
const admin = requireFunc('firebase-admin');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keyIdx = args.indexOf('--key');
let credentials = null;

if (keyIdx !== -1) {
  credentials = require(path.resolve(args[keyIdx + 1]));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credentials = JSON.parse(
    require('fs').readFileSync(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8')
  );
}

if (!credentials) {
  console.error(
    '[sanitize_mojibake] Credenciais ausentes. Use --key <caminho-do-service-account.json> ' +
    'ou defina GOOGLE_APPLICATION_CREDENTIALS.'
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(credentials) });
const db = admin.firestore();

/* ── Decodificação reversa (mesmo algoritmo usado no código-fonte) ── */

const windows1252 = new TextDecoder('windows-1252');

function reparar(s) {
  if (typeof s !== 'string' || !s) return null;

  let out = s;
  out = aplicarDicionario(out);   // casos CP1252 (Ó, Ê, —, “ ” …)
  out = aplicarFaixa(out);        // casos gerais (ã, é, ç, í …)
  return out === s ? null : out;
}

function aplicarDicionario(s) {
  const codigos = [];
  for (let c = 0x00c0; c <= 0x00ff; c++) codigos.push(c);
  codigos.push(0x0152, 0x0153, 0x0160, 0x0161, 0x017d, 0x017e, 0x0178, 0x0192,
    0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2026,
    0x2039, 0x203a, 0x20ac, 0x2011);

  const pares = [];
  for (const code of codigos) {
    const ch = String.fromCharCode(code);
    const bytes = Buffer.from(ch, 'utf8');
    const mj = windows1252.decode(bytes);
    if (mj !== ch) pares.push({ mj, ch });
  }
  pares.sort((a, b) => b.mj.length - a.mj.length);

  for (const { mj, ch } of pares) s = s.split(mj).join(ch);
  return s;
}

function aplicarFaixa(s) {
  let out = '';
  for (let i = 0; i < s.length; ) {
    const c = s.charCodeAt(i);
    if (c >= 0x80 && c <= 0xff) {
      let j = i;
      while (j < s.length && s.charCodeAt(j) >= 0x80 && s.charCodeAt(j) <= 0xff) j++;
      const run = s.slice(i, j);
      if (j - i >= 2) {
        const bytes = Buffer.from(Array.from(run, ch => ch.charCodeAt(0)));
        try {
          const dec = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (!dec.includes('\uFFFD')) {
            out += dec;
            i = j;
            continue;
          }
        } catch { /* run inválida → mantém original */ }
      }
      out += run;
      i = j;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

/* ── Varredura do Firestore ── */

const COLECOES = [
  { nome: 'products', campos: ['name', 'category', 'brand', 'description'] },
  { nome: 'users', campos: ['name', 'inmateName', 'prisonerName'] },
  { nome: 'suppliers', campos: ['name', 'cnpj'] },
];

async function main() {
  let total = 0;
  const resumo = [];

  for (const colecao of COLECOES) {
    const pendentes = [];
    const snap = await db.collection(colecao.nome).get();

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const update = {};
      for (const campo of colecao.campos) {
        const valor = data[campo];
        if (typeof valor !== 'string' || !valor) continue;
        const reparado = reparar(valor);
        if (reparado !== null && reparado !== valor) update[campo] = reparado;
      }
      if (Object.keys(update).length > 0) {
        pendentes.push({ id: docSnap.id, campos: Object.keys(update), antes: update });
      }
    });

    const totalColecao = pendentes.length;
    total += totalColecao;
    resumo.push({ nome: colecao.nome, total: totalColecao });

    if (totalColecao > 0) {
      console.log(`\n${colecao.nome}: ${totalColecao} documento(s) com texto corrompido.`);
      pendentes.slice(0, 5).forEach(p => {
        console.log(`  • ${p.id} → campos ${p.campos.join(', ')}`);
        for (const [campo, valor] of Object.entries(p.antes)) {
          console.log(`      ${campo}: "${valor}"`);
        }
      });
    }

    if (apply && totalColecao > 0) {
      try {
        let batch = db.batch();
        let op = 0;
        for (const p of pendentes) {
          batch.update(db.collection(colecao.nome).doc(p.id), p.antes);
          op++;
          if (op % 500 === 0) {
            await batch.commit();
            batch = db.batch();
          }
        }
        if (op % 500 !== 0) await batch.commit();
        console.log(`  → ${totalColecao} atualizado(s) em ${colecao.nome}.`);
      } catch (err) {
        console.error(`  → FALHA ao atualizar ${colecao.nome}:`, err.message);
      }
    }
  }

  console.log('\n════ RESUMO ════');
  let out = '';
  for (const r of resumo) out += `  ${r.nome}: ${r.total}\n`;
  console.log(out.trim());
  console.log(apply
    ? 'Modo: APLICAÇÃO (--apply) — escrita concluída.'
    : 'Modo: DRY-RUN — nada foi gravado. Rode com --apply para corrigir.');
}

main().catch(e => { console.error('[sanitize_mojibake] erro fatal:', e); process.exit(1); });