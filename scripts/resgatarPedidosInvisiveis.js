/**
 * RESGATE DE PEDIDOS INVISÍVEIS (venda em dupla antigas).
 *
 * Antes do patch em functions/index.js, a Venda em Dupla gravava o pedido
 * SEM `createdAt` e SEM `status`. A lista do admin usa orderBy('createdAt'),
 * que EXCLUI documentos sem esse campo — o pedido existia, mas era invisível.
 *
 * Este script varre a coleção `orders` e retroalimenta os campos faltantes:
 *  - createdAt ← doc.createTime (data REAL de criação no Firestore)
 *  - status    ← 'paid' apenas se estiver ausente (nunca sobrescreve existente)
 *
 * USO (requer chave de serviço com permissão no projeto):
 *   1. Baixe a chave no Firebase Console → Configurações → Contas de serviço.
 *   2. No terminal:  set GOOGLE_APPLICATION_CREDENTIALS=caminho\chave.json
 *   3. node scripts/resgatarPedidosInvisiveis.js          (simula e mostra)
 *      node scripts/resgatarPedidosInvisiveis.js --aplicar  (grava de verdade)
 */

const admin = require("firebase-admin");

admin.initializeApp(); // usa GOOGLE_APPLICATION_CREDENTIALS
const db = admin.firestore();

const APLICAR = process.argv.includes("--aplicar");
const LOTE = 300;

(async () => {
  const snap = await db.collection("orders").limit(1000).get();
  let candidatos = 0, corrigidos = 0;

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const semCreatedAt = !d.createdAt;
    const semStatus = !d.status;
    if (!semCreatedAt && !semStatus) continue;

    candidatos++;
    const patch = {};
    if (semCreatedAt) {
      // createTime = timestamp real de criação do documento no servidor.
      patch.createdAt = doc.createTime ? doc.createTime.toDate().toISOString() : new Date().toISOString();
    }
    if (semStatus) patch.status = "paid"; // venda PDV nasce paga

    console.log(`[${candidatos}] pedido ${doc.id} →`, JSON.stringify(patch));

    if (APLICAR) {
      await doc.ref.update(patch);
      corrigidos++;
    }
  }

  console.log("─".repeat(50));
  console.log(`Encontrados: ${candidatos} | ${APLICAR ? "Corrigidos" : "Seriam corrigidos"}: ${APLICAR ? corrigidos : candidatos}`);
  if (!APLICAR) console.log("Simulação apenas. Rode novamente com --aplicar para gravar.");
  process.exit(0);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
