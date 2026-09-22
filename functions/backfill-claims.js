// ─────────────────────────────────────────────────────────────
// Backfill de Custom Claims — PASSO 2 do Go-Live (ver scripts/go-live.ps1)
//
// Uso (a partir da pasta functions/):
//   node backfill-claims.js <caminho-da-service-account.json>
//   # ou com variável de ambiente:
//   GOOGLE_APPLICATION_CREDENTIALS=<caminho> node backfill-claims.js
//
// O que faz: itera TODOS os docs de users/ e grava os custom claims no Firebase
// Auth (admin: true/false e vendedor: true/false), com o MESMO critério do
// trigger sincronizarClaimsNoDoc (role admin|master ⇒ admin, vendedor|operator
// ⇒ vendedor, ambos somente com status ativo). Deve rodar UMA vez, ANTES do
// deploy das Security Rules, para que todos os admins/vendedores tenham o claim
// no ID token após relogarem.
//
// Critério espelhado de functions/index.js (sincronizarClaimsUsuario):
//   ehAdmin    = role admin|master (lowercase) AND status ausente ou 'active'
//   ehVendedor = role vendedor|operator (lowercase) AND status ausente ou 'active'
// ─────────────────────────────────────────────────────────────
"use strict";

const admin = require("firebase-admin");
const path = require("path");

const TAMANHO_LOTE = 500;

function ehAdmin(usuario) {
  const role = String((usuario && usuario.role) || "user").toLowerCase();
  const statusAtivo =
    !usuario || !usuario.status || String(usuario.status).toLowerCase() === "active";
  return ["admin", "master"].includes(role) && statusAtivo;
}

function ehVendedor(usuario) {
  const role = String((usuario && usuario.role) || "user").toLowerCase();
  const statusAtivo =
    !usuario || !usuario.status || String(usuario.status).toLowerCase() === "active";
  return ["vendedor", "operator"].includes(role) && statusAtivo;
}

async function main() {
  const keyFile =
    process.argv[2] ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!keyFile) {
    console.error(
      "Informe a service account:\n  node backfill-claims.js <caminho-da-service-account.json>\n" +
      "ou defina a variável GOOGLE_APPLICATION_CREDENTIALS."
    );
    process.exit(1);
  }

  const caminhoAbsoluto = path.resolve(keyFile);
  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(caminhoAbsoluto)),
    });
  } catch (e) {
    console.error("Falha ao carregar a service account:", e.message);
    process.exit(1);
  }

  const db = admin.firestore();
  let cursor = null;
  let total = 0;
  let admins = 0;
  let pulados = 0;

  console.log("[Backfill Claims] Iniciando varredura de users/...");
  do {
    let q = db.collection("users").orderBy("__name__").limit(TAMANHO_LOTE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const dados = d.data();
      // Usuários LEGADOS têm doc id ≠ authUid (id antigo). O claim deve ir no
      // UID REAL do Firebase Auth (campo authUid), senão o setCustomUserClaims
      // falha com "no user record" e o admin legado fica sem o claim (e sem o
      // fallback da rules, que lê users/{uid} pelo doc id REAL).
      const alvo = String(dados.authUid || d.id || "");
      if (!alvo) { pulados += 1; continue; }
      const claim = {
        admin: ehAdmin(dados),
        vendedor: ehVendedor(dados),
      };
      try {
        await admin.auth().setCustomUserClaims(alvo, claim);
      } catch (e) {
        // Sem conta no Auth (doc órfão) ou falha transitória — não aborta o lote.
        console.warn(`[Backfill Claims] Pulando ${alvo} (doc ${d.id}): ${e?.message || e}`);
        pulados += 1;
        continue;
      }
      total += 1;
      if (claim.admin) admins += 1;
    }
    cursor = snap.docs[snap.docs.length - 1];
  } while (cursor);

  console.log(
    `[Backfill Claims] Concluído: ${total} usuário(s) processado(s), ${admins} admin(s)` +
    (pulados ? `, ${pulados} pulado(s) sem conta no Auth.` : ".")
  );
  console.log(
    "IMPORTANTE: os admins precisam RELOGAR (sair e entrar) para o ID token\n" +
    "carregar o claim admin:true — só então deploy das Security Rules (PRÓXIMO passo)."
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[Backfill Claims] Falha fatal:", e.message || e);
  process.exit(1);
});