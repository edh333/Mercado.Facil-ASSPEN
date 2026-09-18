const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// Lógica pura de negócio (testável) — decisões financeiras vêm daqui.
const {
  arredondar,
  cleanCpf,
  sanitizarToken,
  validarItensPuros,
  calcularPartesPagamento,
  validarTroco,
  verificarLimiteSemanal,
  validarSaldoSuficiente,
  calcularNovoSaldo,
  caminhoStorageDeUrl,
  calcularSplitVenda,
  calcularEstornoCarteira,
} = require("./logic");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Bucket real do projeto (o padrão "project.appspot.com" foi descontinuado
// pelo Firebase — o bucket ativo é "{project}.firebasestorage.app").
const FUNC_BUCKET = process.env.FIREBASE_STORAGE_BUCKET
  || `${process.env.GCLOUD_PROJECT || "mercado-facil-mt"}.firebasestorage.app`;

// URL pública de download (usada para itens de leitura pública, ex.: apps/).
// Evita getSignedUrl: a service account padrão do projeto não tem o papel
// iam.serviceAccountTokenCreator (signBlob negado desde a política de 2024).
const urlPublicaArquivo = (file) =>
  `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`;

// URL de download via token nativo do Firebase Storage (metadata), para
// arquivos NÃO públicos. Se não conseguir ler/definir o token, retorna "".
async function urlDownloadComToken(file) {
  try {
    const [meta] = await file.getMetadata();
    let tokens = String(meta.metadata?.firebaseStorageDownloadTokens || "");
    let tok = tokens.split(",")[0] || "";
    if (!tok || tok.startsWith("eyJ")) { // token vazio ou antigo → gera um limpo
      tok = crypto.randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: tok } });
    }
    return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${tok}`;
  } catch (e) {
    logger.warn("[Storage] Falha ao gerar URL com token:", e.message);
    return "";
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Email padrão usado como login do Firebase Auth para usuários sem e-mail real. */
function authEmailPara(cpf, email) {
  const real = String(email || "").trim().toLowerCase();
  if (real.includes("@") && !real.endsWith("@asspen.local")) return real;
  return `${cleanCpf(cpf)}@asspen.local`;
}

async function usuarioPorAuthUid(uid) {
  const snap = await db.collection("users").where("authUid", "==", uid).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  // Proteção contra índice inconsistente (doc fantasma com authUid duplicado):
  // o documento canônico é aquele cujo ID == UID do Auth.
  if (doc.id !== uid) {
    const canonico = await db.collection("users").doc(uid).get();
    if (canonico.exists && canonico.data().authUid === uid) {
      return { id: canonico.id, ...canonico.data() };
    }
  }
  return { id: doc.id, ...doc.data() };
}

async function usuarioPorCpf(cpf) {
  const c = cleanCpf(cpf);
  if (c.length < 11) return null;
  let snap = await db.collection("users").where("cpf", "==", c).limit(1).get();
  if (snap.empty) {
    // Legacy: CPF armazenado formatado (000.000.000-00)
    const formatado = c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    snap = await db.collection("users").where("cpf", "==", formatado).limit(1).get();
  }
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function usuarioPorEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const snap = await db.collection("users").where("email", "==", e).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/** Garante que o chamador é admin (role 'admin'/'ADMIN'/'master' no doc users) e está ativo. */
async function exigirAdmin(context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new HttpsError("unauthenticated", "Você precisa estar autenticado.");
  }
  const u = await usuarioPorAuthUid(context.auth.uid);
  const ehAdmin = u && ["admin", "master"].includes(String(u.role || "").toLowerCase());
  if (!u || !ehAdmin) {
    throw new HttpsError("permission-denied", "Acesso restrito a administradores.");
  }
  if (u.status && u.status !== "active") {
    throw new HttpsError("permission-denied", "Conta suspensa ou pendente. Contate o administrador.");
  }
  return u;
}

/** Garante que o chamador é o ADMINISTRADOR PRINCIPAL (crédito manual e operações sensíveis). */
async function exigirAdminPrincipal(context) {
  const u = await exigirAdmin(context);
  const ehPrincipal = u.mainAdmin === true ||
    u.id === "admin" || u.id === "master" ||
    (u.email || "").toLowerCase() === "admin@mercado.com";
  if (!ehPrincipal) {
    throw new HttpsError("permission-denied", "Apenas o administrador principal pode realizar esta operação.");
  }
  return u;
}

/**
 * Admin com permissão específica (granular). O principal sempre passa.
 * Admins legados sem o campo permissions = acesso total (compatibilidade).
 */
async function exigirAdminPermissao(context, permissao) {
  const u = await exigirAdmin(context);
  if (!permissao) return u;
  const ehPrincipal = u.mainAdmin === true ||
    u.id === "admin" || u.id === "master" ||
    (u.email || "").toLowerCase() === "admin@mercado.com";
  if (ehPrincipal) return u;
  const perms = u.permissions;
  if (perms === undefined || perms === null) return u;
  if (perms.includes("all") || perms.includes(permissao)) return u;
  throw new HttpsError(
    "permission-denied",
    "Seu acesso a esta função foi restringido pelo administrador principal."
  );
}

// ──────────────────────────────────────────────
// CUSTOM CLAIMS (migração da regra isAdmin nas rules)
// ──────────────────────────────────────────────
// As regras do Firestore/Storage leem request.auth.token.admin (0 leituras).
// A FONTE DA VERDADE é o doc users: este trigger mantém o claim em sincronia
// a cada escrita (criação, suspensão, promoção, exclusão). Ver:
//   docs: firestore.rules → isAdmin()
//
// Regra de linha de comando:
//   ehAdmin = role admin/master AND status ativo/ausente (mesmo critério do
//   exigirAdmin das functions). Suspender/desativar um admin REVOGA o claim,
//   derrubando o acesso dele a dados protegidos imediatamente.
async function sincronizarClaimsUsuario(uid, usuario) {
  if (!uid) return;
  const role = String((usuario && usuario.role) || "user").toLowerCase();
  const statusAtivo = !usuario || !usuario.status || String(usuario.status).toLowerCase() === "active";
  const ehAdmin = ["admin", "master"].includes(role) && statusAtivo;
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: ehAdmin });
  } catch (e) {
    logger.warn("[Claims] Falha ao definir claims de " + uid + ":", e.message);
  }
}

/** Firestore trigger: usuários/{userId} → sincroniza claims (cria/altera/deleta). */
exports.sincronizarClaimsNoDoc = onDocumentWritten("users/{userId}", async (event) => {
  const uid = event.params.userId;
  const antes = event.data.before.exists ? event.data.before.data() : null;
  const depois = event.data.after.exists ? event.data.after.data() : null;
  if (!depois && !antes) return;

  const roleAntes = String((antes && antes.role) || "").toLowerCase();
  const roleDepois = String((depois && depois.role) || "").toLowerCase();
  const statusDepois = depois && depois.status;
  const statusAntes = antes && antes.status;

  // Só reescreve quando ROLE ou STATUS mudam (evita churn em edições comuns:
  // saldo, email, telefone, permissões...). Exclusão (depois null) → revoga.
  const mudouRole = roleAntes !== roleDepois;
  const mudouStatus = String(statusAntes || "") !== String(statusDepois || "");
  if (!mudouRole && !mudouStatus) {
    if (antes && depois) return;
  }
  await sincronizarClaimsUsuario(uid, depois);
});

/**
 * Verifica a SENHA SECUNDÁRIA/MESTRA informada para operações sensíveis
 * (aporte, retirada, restauração).
 *  - Formato atual: bcrypt em settings/private.masterPasswordHash.
 *  - Formato LEGADO: plaintext em settings/general.secondaryPassword /
 *    adminPassword — ao acertar a senha legada, MIGRA automaticamente para
 *    bcrypt (settings/private) e apaga o plaintext (uma única vez).
 *  - Sem nenhum formato configurado: falha seguro com orientação clara.
 */
async function verificarSenhaMestra(informada) {
  const senha = String(informada || "");
  const privSnap = await db.collection("settings").doc("private").get();
  const priv = privSnap.exists ? privSnap.data() : {};
  if (priv.masterPasswordHash) {
    const ok = await bcrypt.compare(senha, priv.masterPasswordHash);
    if (!ok) throw new HttpsError("permission-denied", "Senha secundária inválida.");
    return;
  }
  const genSnap = await db.collection("settings").doc("general").get();
  const gen = genSnap.exists ? genSnap.data() : {};
  const legada = String(gen.secondaryPassword || gen.adminPassword || "");
  if (!legada) {
    throw new HttpsError(
      "failed-precondition",
      "A senha secundária ainda não foi configurada. Vá em Configurações > Segurança e defina a senha secundária (mínimo 8 caracteres) antes de continuar."
    );
  }
  if (senha !== legada) {
    throw new HttpsError("permission-denied", "Senha secundária inválida.");
  }
  // Migração automática do formato antigo para bcrypt (remove o plaintext).
  const hash = await bcrypt.hash(legada, 12);
  await db.collection("settings").doc("private").set({ masterPasswordHash: hash }, { merge: true });
  await db.collection("settings").doc("general").update({
    secondaryPassword: admin.firestore.FieldValue.delete(),
    adminPassword: admin.firestore.FieldValue.delete(),
  }).catch(() => {});
  logger.info("[Segurança] Senha secundária migrada do formato legado para bcrypt.");
}

/** Garante que o chamador está autenticado. */
async function exigirAutenticado(context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new HttpsError("unauthenticated", "Você precisa estar autenticado.");
  }
  const u = await usuarioPorAuthUid(context.auth.uid);
  if (!u) throw new HttpsError("unauthenticated", "Conta não vinculada a um usuário do sistema.");
  if (u.status && u.status !== "active") {
    throw new HttpsError("permission-denied", "Conta suspensa ou pendente. Contate o administrador.");
  }
  return u;
}

function validarSenha(senha) {
  const s = String(senha || "");
  if (s.length < 6) throw new HttpsError("invalid-argument", "A senha deve ter pelo menos 6 caracteres.");
  return s;
}

function validarValor(valor, minimo = 0.01) {
  const v = Number(valor);
  if (!isFinite(v) || v < minimo) throw new HttpsError("invalid-argument", "Valor inválido.");
  return arredondar(v);
}

// Módulos que um admin secundário pode acessar. "all" = acesso total.
const PERMISSOES_ADMIN = [
  "all", "orders", "products", "sales", "cash",
  "inmates", "users", "finance", "wallet", "reports",
];

function validarPermissoesAdmin(perms) {
  if (perms === undefined || perms === null) return ["all"];
  if (!Array.isArray(perms)) throw new HttpsError("invalid-argument", "Permissões inválidas.");
  const unicas = [...new Set(perms.filter((p) => PERMISSOES_ADMIN.includes(p)))];
  if (unicas.includes("all")) return ["all"];
  return unicas;
}

// Rate limiting em memória (por instância de função) — janela deslizante por chave.
// Suficiente para conter abuso de endpoints públicos/autenticados: os mapas são
// pequenos (uma entrada por chave única) e expiram sozinhos com o tempo.
const rateLimitMap = new Map();
const RATE_LIMIT_JANELA_MS = 60 * 1000;

function verificarRateLimit(chave, maxChamadasPorJanela, janelaMs = RATE_LIMIT_JANELA_MS) {
  const agora = Date.now();
  // Poda oportunista: quando o mapa cresce, remove entradas velhas (2x a
  // janela de todas as chaves). Mantém a memória estável em operação contínua
  // de longa duração (anos), sem custo relevante nas chamadas normais.
  if (rateLimitMap.size > 5000) {
    for (const [k, r] of rateLimitMap) {
      if (agora - r.t0 > janelaMs * 2) rateLimitMap.delete(k);
    }
  }
  const rec = rateLimitMap.get(chave);
  if (!rec || agora - rec.t0 > janelaMs) {
    rateLimitMap.set(chave, { t0: agora, n: 1 });
    return;
  }
  rec.n += 1;
  if (rec.n > maxChamadasPorJanela) {
    throw new HttpsError(
      "resource-exhausted",
      "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente."
    );
  }
}

function ipDoRequest(request) {
  const headers = (request && request.rawRequest && request.rawRequest.headers) || {};
  return String(
    headers["cf-connecting-ip"] ||
    headers["x-forwarded-for"] ||
    headers["x-appengine-user-ip"] ||
    "desconhecido"
  ).split(",")[0].trim();
}

// Hash legado de senha mora em auth_secrets/{uid} (coleção admin-only, fora do
// doc público users/{uid} que o próprio usuário consegue ler via regras).
// Fallback para users/{uid}.password cobre registros anteriores à migração.
async function obterHashLegado(userId) {
  try {
    const sec = await db.collection("auth_secrets").doc(userId).get();
    if (sec.exists && sec.data().password) return String(sec.data().password);
  } catch (e) {
    logger.warn("[obterHashLegado] falha em auth_secrets:", e.message);
  }
  const userSnap = await db.collection("users").doc(userId).get();
  return userSnap.exists ? String(userSnap.data().password || "") : "";
}

async function salvarHashLegado(userId, hash) {
  await db.collection("auth_secrets").doc(userId).set(
    { password: hash, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

async function registrarTransacaoCarteira(t, ref, dados) {
  const txId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  t.set(ref, { ...dados, id: txId });
}

/**
 * Registra uma ação sensível na coleção audit_logs (imutável).
 * NUNCA grava senhas, hashes ou tokens — apenas metadados operacionais.
 */
async function registrarAudit(operadorUid, acaoTipo, payloadAntes = null, payloadDepois = null) {
  try {
    await db.collection("audit_logs").add({
      operadorUid,
      timestamp: new Date().toISOString(),
      acaoTipo,
      payloadAntes: payloadAntes ?? null,
      payloadDepois: payloadDepois ?? null,
    });
  } catch (e) {
    logger.warn("Falha ao registrar auditoria:", e.message);
  }
}

// ──────────────────────────────────────────────
// AUTENTICAÇÃO E CONTAS
// ──────────────────────────────────────────────

/**
 * Público — consulta mínima para o login saber qual e-mail usar no Firebase Auth.
 * NÃO expõe senhas, saldos ou dados sensíveis.
 */
exports.buscarLoginInfo = onCall(async (request) => {
  try {
  verificarRateLimit("buscarLoginInfo:" + ipDoRequest(request), 30);
  const identificador = String(request.data?.identificador || "").trim();
  if (!identificador) throw new HttpsError("invalid-argument", "Informe CPF ou e-mail.");

  let usuario = await usuarioPorCpf(identificador);
  if (!usuario && identificador.includes("@")) {
    const snap = await db.collection("users").where("email", "==", identificador.trim().toLowerCase()).limit(1).get();
    if (!snap.empty) usuario = { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  if (!usuario) {
    // Informa se existem admins (usado pela tela de primeiro acesso)
    const admins = await db.collection("users").where("role", "==", "admin").limit(1).get();
    return { encontrado: false, existemAdmins: !admins.empty };
  }

  return {
    encontrado: true,
    jaVinculado: Boolean(usuario.authUid),
    authEmail: authEmailPara(usuario.cpf, usuario.email),
    role: usuario.role || "user",
    status: usuario.status || "pending",
  };
  } catch (e) {
    if (e && e.code && String(e.code).indexOf("functions/") === 0) throw e;
    const msgErro = String((e && e.message) || "").trim();
    console.error("[buscarLoginInfo] Falha ao processar a solicita\u00e7\u00e3o", { msg: msgErro, stack: e && e.stack ? e.stack : undefined });
    if (new RegExp("produto n\u00e3o encontrado|estoque insuficiente|saldo insuficiente|limite semanal|limite de|consumidor final|n\u00e3o confere com o total|nenhuma sess\u00e3o de caixa|caixa antes|caixa foi fechada|reabra o caixa|cliente bloqueado|cliente de fiado|exige cliente cadastrado|pagamento misto sem valores|m\u00e9todo inv\u00e1lido|valor inv\u00e1lido|fiado e card n\u00e3o s\u00e3o suportados|carteira|duplicada|troco|cadastro em an\u00e1lise|em an\u00e1lise|an\u00e1lise|primeiro acesso|conta suspensa|conta bloqueada|conta pendente|usu\u00e1rio n\u00e3o encontrad|usu\u00e1rio n\u00e3o cadastrad|usu\u00e1rio n\u00e3o existe|usu\u00e1rio j\u00e1|n\u00e3o foi poss\u00edvel encontrar|e-mail ou senha|e-mail e senha|credenciais|senha incorreta|senha inv\u00e1lida|informe o CPF|informe CPF|informe o e-mail|informe e-mail|caracteres|m\u00ednimo|m\u00e1ximo|redefinir senha|novo acesso|n\u00e3o pode ser|n\u00e3o confere|j\u00e1 cadastrad|j\u00e1 utilizad|j\u00e1 vinculad|n\u00e3o cadastrad|n\u00e3o existe|existe|bloquead|suspens|pendente|aguarde|tente novamente|tentativas|excedeu|aguardando|aprova\u00e7\u00e3o|aprovad|rejeitad|an\u00e1lise manual|revisor|moderador|admin|permiss\u00e3o|acesso restrito|n\u00e3o autenticado|n\u00e3o autorizad|conta n\u00e3o encontrada|conta n\u00e3o existe|conta suspensa", "i").test(msgErro)) {
      throw new HttpsError("invalid-argument", msgErro);
    }
    throw new HttpsError("internal", "Falha ao processar a solicita\u00e7\u00e3o. Tente novamente.");
  }
});

/**
 * Autenticado — retorna os dados do próprio usuário logado (server-side).
 * Substitui a query client-side `where('authUid', '==', uid)` que vaza PII.
 */
exports.buscarUsuarioAtual = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sessão expirada. Entre novamente.");
  }
  try {
    const snap = await db.collection("users").where("authUid", "==", request.auth.uid).limit(1).get();
    if (snap.empty) {
      throw new HttpsError("not-found", "Usuário não encontrado.");
    }
    const doc = snap.docs[0];
    const data = doc.data();
    const status = String(data.status || "pending").toLowerCase();
    if (status === "suspended") {
      throw new HttpsError("permission-denied", "Conta suspensa. Contate a administração.");
    }
    if (status === "pending") {
      // O frontend depende DESTA exceção para exibir a tela "CADASTRO EM ANÁLISE"
      // (context/StoreContext.tsx trata functions/failed-precondition).
      throw new HttpsError("failed-precondition", "Cadastro em análise. Aguarde aprovação.");
    }
    // Shape de retorno ESTÁVEL (mesmos campos que o frontend sempre consumiu) —
    // incluindo os usados pelo PDV/family app (selectedUnitId, permissions...).
    return {
      id: doc.id,
      name: data.name || data.nome || "",
      email: data.email || "",
      cpf: data.cpf || "",
      role: data.role || "user",
      status,
      walletBalance: Number(data.walletBalance || data.carteira || 0),
      weeklySpent: Number(data.weeklySpent || data.gastoSemanal || 0),
      inmateName: data.inmateName || data.prisonerName || "",
      inmateCpf: data.inmateCpf || data.prisonerCpf || "",
      selectedUnitId: data.selectedUnitId || data.unitId || "",
      avatarUrl: data.avatarUrl || "",
      phone: data.phone || "",
      mainAdmin: Boolean(data.mainAdmin),
      permissions: data.permissions || [],
    };
  } catch (e) {
    if (e && e.code && String(e.code).indexOf("functions/") === 0) throw e;
    const msg = String((e && e.message) || "").trim();
    console.error("[buscarUsuarioAtual] Falha ao processar a solicitação", { msg, stack: e && e.stack ? e.stack : undefined });
    if (new RegExp("não encontrado|não cadastrad|não existe|informe|inválid|bloquead|suspens|pendente|em análise|análise|usuário|conta|não autorizad|permissão|sessão|token", "i").test(msg)) {
      throw new HttpsError("invalid-argument", msg);
    }
    throw new HttpsError("internal", "Falha ao processar a solicitação. Tente novamente.");
  }
});

exports.registrarUsuario = onCall(async (request) => {
  const ip = ipDoRequest(request);
  verificarRateLimit("registrarUsuario:" + ip, 5);
  const dados = request.data?.dados || {};
  const senha = String(request.data?.senha || "");
  const provisionar = Boolean(request.data?.provisionar);
  const cpf = cleanCpf(dados.cpf);
  if (cpf.length === 11) verificarRateLimit("registrarUsuarioCpf:" + cpf, 3);
  // Rate limit por e-mail para cadastros sem CPF (evita spam via IPs rotativos)
  if (dados.email) verificarRateLimit("registrarUsuarioEmail:" + String(dados.email).toLowerCase().trim(), 3);

  let existente = null;
  if (cpf.length === 11) {
    existente = await usuarioPorCpf(cpf);
  } else if (dados.email) {
    existente = await usuarioPorEmail(dados.email);
  }
  if (cpf.length !== 11 && !dados.email) throw new HttpsError("invalid-argument", "CPF inválido.");
  const email = authEmailPara(cpf || (existente && existente.cpf), dados.email);

  if (provisionar) {
    if (!existente) throw new HttpsError("not-found", "Usuário não encontrado para vinculo.");
    if (existente.authUid) throw new HttpsError("already-exists", "Este usuário já possui conta vinculada.");
    if (senha.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        existente.role === "admin"
          ? "A senha atual do administrador tem menos de 6 caracteres. Atualize o campo password do documento users/" +
            existente.id +
            " no Firestore (texto puro, mínimo 6) e tente novamente."
          : "Sua senha atual tem menos de 6 caracteres. Use 'Esqueci minha senha' na tela de login para definir uma nova senha (mínimo 6)."
      );
    }

    const hashSalvo = await obterHashLegado(existente.id);
    if (hashSalvo && hashSalvo.startsWith("$2")) {
      const ok = await bcrypt.compare(senha, hashSalvo);
      if (!ok) throw new HttpsError("invalid-argument", "Senha atual incorreta.");
    } else if (hashSalvo && hashSalvo !== senha) {
      throw new HttpsError("invalid-argument", "Senha atual incorreta.");
    }

    try {
      const authUser = await admin.auth().createUser({ email, password: senha });
      // Usuário legado: migra o documento para id == UID do Auth (regras e buscas diretas dependem disso).
      if (existente.id !== authUser.uid) {
        const dados = { ...existente };
        delete dados.id;
        const novoRef = db.collection("users").doc(authUser.uid);
        const existeNovo = await novoRef.get();
        if (existeNovo.exists) await novoRef.delete();
        await novoRef.set({ ...dados, authUid: authUser.uid });

        const atualizarReferencias = async (col, campo) => {
          let snap = await db.collection(col).where(campo, "==", existente.id).limit(500).get();
          while (!snap.empty) {
            const batch = db.batch();
            snap.docs.forEach((d) => batch.update(d.ref, { [campo]: authUser.uid }));
            await batch.commit();
            snap = await db.collection(col).where(campo, "==", existente.id).limit(500).get();
          }
        };
        await Promise.all([
          atualizarReferencias("orders", "operatorId"),
          atualizarReferencias("cash_sessions", "operatorId"),
          atualizarReferencias("wallet_transactions", "payerId"),
        ]);
        await db.collection("users").doc(existente.id).delete();
      } else {
        await db.collection("users").doc(existente.id).update({ authUid: authUser.uid });
      }
      return { ok: true, vinculado: true };
    } catch (e) {
      throw new HttpsError("internal", "Falha ao vincular conta. Tente novamente.");
    }
  }

  if (existente) throw new HttpsError("already-exists", "CPF já cadastrado.");

  const role = String(dados.role || "user") === "FAMILY" ? "FAMILY" : "user";

  // Validação do interno pré-cadastrado (server-side, já que o cliente ainda não está autenticado)
  const inmateCpf = cleanCpf(dados.inmateCpf);
  if (role === "FAMILY" && inmateCpf.length !== 11) {
    // Hardening: o vínculo com um interno pré-cadastrado é OBRIGATÓRIO para familiar.
    // Sem isso, uma chamada direta ao callable com CPF vazio/curto criava FAMILY solta.
    throw new HttpsError(
      "invalid-argument",
      "Informe o CPF do interno (11 dígitos). O interno precisa estar pré-cadastrado pela administração."
    );
  }
  if (inmateCpf.length === 11 && role === "FAMILY") {
    const preSnap = await db.collection("pre_registered_inmates")
      .where("cpf", "==", inmateCpf).limit(1).get();
    if (preSnap.empty) {
      // Sempre bloqueia — mesmo quando a coleção de pré-cadastros está vazia.
      // (Antes, coleção vazia = qualquer CPF de interno era aceito; um atacante
      // podia se cadastrar como FAMILY de qualquer detento e esgotar os 3 slots.)
      throw new HttpsError(
        "invalid-argument",
        "O interno informado não está pré-cadastrado no sistema. Por favor, entre em contato com a administração."
      );
    }
    const preDoc = preSnap.docs[0];
    const preName = String(preDoc.data().name || "").slice(0, 120);
    if (!dados.inmateName && preName) dados.inmateName = preName;
    if (!dados.prisonerName && preName) dados.prisonerName = preName;
    const fams = await db.collection("users")
      .where("inmateCpf", "==", inmateCpf)
      .where("role", "==", "FAMILY")
      .limit(4)
      .get();
    if (fams.size >= 3) {
      throw new HttpsError("invalid-argument", "Limite de familiares excedido para este interno.");
    }
  }

  const hash = await bcrypt.hash(senha, 12);
  let uid;
  try {
    const authUser = await admin.auth().createUser({ email, password: senha });
    uid = authUser.uid;
  } catch (e) {
    throw new HttpsError("already-exists", "Falha ao criar conta. Tente novamente.");
  }

  const novo = {
    id: uid,
    authUid: uid,
    name: String(dados.name || "Usuário").slice(0, 80),
    cpf,
    email: String(dados.email || "").slice(0, 120),
    role,
    status: "pending",
    approved: false,
    walletBalance: 0,
    weeklySpent: 0,
    phone: String(dados.phone || "").slice(0, 20),
    inmateCpf: cleanCpf(dados.inmateCpf),
    inmateName: String(dados.inmateName || "").slice(0, 120),
    prisonerCpf: cleanCpf(dados.prisonerCpf),
    prisonerName: String(dados.prisonerName || "").slice(0, 120),
    createdAt: new Date().toISOString(),
  };
  await db.collection("users").doc(uid).set(novo);
  await salvarHashLegado(uid, hash);
  return { ok: true, userId: uid };
});

/**
 * Público — primeiro acesso: cria o administrador inicial.
 * Só funciona enquanto não existir NENHUM admin no sistema.
 */
exports.criarPrimeiroAdmin = onCall(async (request) => {
  const nome = String(request.data?.nome || "").trim();
  const email = String(request.data?.email || "").trim().toLowerCase();
  const senha = validarSenha(request.data?.senha);
  if (!nome) throw new HttpsError("invalid-argument", "Informe o nome.");
  if (!email.includes("@") || email.length < 6) throw new HttpsError("invalid-argument", "E-mail inválido.");

  // Trava atômica: verificar admin E reivindicar o setup na MESMA transação,
  // fechando a janela TOCTOU entre a checagem e o createUser (duas chamadas
  // concorrentes disputavam o mesmo createUser; agora só uma vence o claim).
  try {
    await db.runTransaction(async (t) => {
      const claimRef = db.collection("settings").doc("setup_claim");
      const claimSnap = await t.get(claimRef);
      if (claimSnap.exists) throw new Error("Já existe um administrador. Faça login.");
      const admins = await t.get(db.collection("users").where("role", "==", "admin").limit(1));
      if (!admins.empty) throw new Error("Já existe um administrador. Faça login.");
      // Verifica e-mail duplicado DENTRO da transação para evitar TOCTOU
      const emailSnap = await t.get(db.collection("users").where("email", "==", email).limit(1));
      if (!emailSnap.empty) throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
      t.set(claimRef, { claimed: true, claimedAt: admin.firestore.Timestamp.now() });
    });
  } catch (e) {
    throw new HttpsError("already-exists", "Já existe um administrador. Faça login.");
  }

  let authUser = null;
  try {
    authUser = await admin.auth().createUser({ email, password: senha });
    const hash = await bcrypt.hash(senha, 12);
    await db.collection("users").doc(authUser.uid).set({
      id: authUser.uid,
      authUid: authUser.uid,
      name: nome,
      email,
      cpf: "00000000000",
      role: "admin",
      mainAdmin: true,
      status: "active",
      approved: true,
      permissions: ["all"],
      walletBalance: 0,
      weeklySpent: 0,
      createdAt: new Date().toISOString(),
    });
    await salvarHashLegado(authUser.uid, hash);
  } catch (e) {
    // Rollback da trava: se qualquer passo falhar, o claim é removido para
    // que o primeiro acesso possa ser tentado novamente (nunca deixar o
    // sistema bloqueado sem administrador).
    await db.collection("settings").doc("setup_claim").delete().catch(() => {});
    if (authUser) await admin.auth().deleteUser(authUser.uid).catch(() => {});
    throw e;
  }
  // Claim explícito: garante que o ID token emitido no login imediato (que
  // acontece logo após esta chamada) já carregue admin:true — sem depender
  // da latência do trigger.
  await sincronizarClaimsUsuario(authUser.uid, { role: "admin", status: "active" });
  return { ok: true, userId: authUser.uid };
});

/** Admin principal — cria outro administrador. */
exports.criarAdmin = onCall(async (request) => {
  const caller = await exigirAdminPrincipal(request);
  const nome = String(request.data?.nome || "").trim();
  const email = String(request.data?.email || "").trim().toLowerCase();
  const cpf = cleanCpf(request.data?.cpf);
  const senha = validarSenha(request.data?.senha);
  if (!nome) throw new HttpsError("invalid-argument", "Informe o nome.");
  if (!email.includes("@") || email.length < 6) throw new HttpsError("invalid-argument", "E-mail inválido.");
  if (cpf && cpf.length !== 11) throw new HttpsError("invalid-argument", "CPF inválido (11 dígitos).");
  if (cpf.length === 11) {
    const dup = await usuarioPorCpf(cpf);
    if (dup) throw new HttpsError("already-exists", "Já existe um usuário com este CPF.");
  }
  const dupEmail = await usuarioPorEmail(email);
  if (dupEmail) throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");

  const authUser = await admin.auth().createUser({ email, password: senha });
  const hash = await bcrypt.hash(senha, 12);
  const permissao = validarPermissoesAdmin(request.data?.permissions);
  await db.collection("users").doc(authUser.uid).set({
    id: authUser.uid,
    authUid: authUser.uid,
    name: nome,
    email,
    cpf: cpf || "00000000000",
    role: "admin",
    status: "active",
    approved: true,
    permissions: permissao,
    walletBalance: 0,
    weeklySpent: 0,
    createdBy: caller.id,
    createdAt: new Date().toISOString(),
  });
  await salvarHashLegado(authUser.uid, hash);
  await registrarAudit(caller.id, "CRIAR_ADMIN", null, { usuarioId: authUser.uid, nome, email, cpf: cpf || null, permissao });
  await sincronizarClaimsUsuario(authUser.uid, { role: "admin", status: "active" });
  return { ok: true, userId: authUser.uid };
});

/** Master - altera as permissões de um admin secundário a qualquer momento. */
exports.atualizarPermissoesAdmin = onCall(async (request) => {
  const caller = await exigirAdminPrincipal(request);
  const userId = String(request.data?.userId || "").trim();
  if (!userId) throw new HttpsError("invalid-argument", "Informe o usuário.");
  const permissoes = request.data?.permissions;
  if (!Array.isArray(permissoes)) {
    throw new HttpsError("invalid-argument", "Informe a lista de permissões.");
  }
  const permissaoFinal = validarPermissoesAdmin(permissoes);

  const snap = await db.collection("users").doc(userId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Usuário não encontrado.");
  const userData = snap.data();
  if (
    userData.mainAdmin === true ||
    userData.id === "admin" || userData.id === "master" ||
    String(userData.email || "").toLowerCase() === "admin@mercado.com"
  ) {
    throw new HttpsError("permission-denied", "Não é possível alterar as permissões do administrador principal.");
  }
  if (!["admin", "master"].includes(String(userData.role || "").toLowerCase())) {
    throw new HttpsError("invalid-argument", "O usuário informado não é um administrador.");
  }

  await db.collection("users").doc(userId).update({
    permissions: permissaoFinal,
    updatedAt: new Date().toISOString(),
  });
  await registrarAudit(caller.id, "ALTERAR_PERMISSOES_ADMIN", userId, {
    de: userData.permissions || null,
    para: permissaoFinal,
  });
  return { ok: true, permissions: permissaoFinal };
});

/**
 * Admin PRINCIPAL — sincroniza claims de TODOS os usuários a partir do doc
 * users (fonte da verdade). Rodar UMA vez na migração, ANTES de publicar as
 * novas regras. Após rodar, todo admin existente deve fazer login de novo
 * (o ID token em cache não carrega o claim até renovar).
 */
exports.sincronizarClaimsAdmin = onCall({ timeoutSeconds: 240 }, async (request) => {
  const caller = await exigirAdminPrincipal(request);
  let total = 0;
  let admins = 0;
  let cursor = null;
  do {
    let q = db.collection("users").orderBy("__name__").limit(500);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      await sincronizarClaimsUsuario(d.id, d.data());
      total++;
      if (["admin", "master"].includes(String(d.data().role || "").toLowerCase())) admins++;
    }
    cursor = snap.docs[snap.docs.length - 1];
  } while (cursor);
  await registrarAudit(caller.id, "SINCRONIZAR_CLAIMS_ADMIN", null, { total, admins });
  logger.info("[Claims] Backfill concluído por " + caller.id + ": " + total + " usuário(s), " + admins + " admin(s).");
  return { ok: true, total, admins };
});

/** Autenticado — altera a própria senha. */
exports.alterarSenha = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  const novaSenha = validarSenha(request.data?.novaSenha);
  await admin.auth().updateUser(request.auth.uid, { password: novaSenha });
  const hash = await bcrypt.hash(novaSenha, 12);
  await salvarHashLegado(user.id, hash);
  await registrarAudit(request.auth.uid, "ALTERAR_SENHA_PROPRIA", null, { usuarioId: user.id });
  return { ok: true };
});

/** Admin — redefine a senha de qualquer usuário (exceto a conta principal). */
exports.redefinirSenhaAdmin = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "users");
  const userId = String(request.data?.userId || "");
  const novaSenha = validarSenha(request.data?.novaSenha);
  if (!userId) throw new HttpsError("invalid-argument", "Informe o usuário.");

  const snap = await db.collection("users").doc(userId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Usuário não encontrado.");
  const userData = snap.data();
  const ehPrincipal = userData.mainAdmin === true ||
    userData.id === "admin" || userData.id === "master" ||
    (userData.email || "").toLowerCase() === "admin@mercado.com";
  if (ehPrincipal) {
    await exigirAdminPrincipal(request);
  }
  if (userData.authUid) {
    await admin.auth().updateUser(userData.authUid, { password: novaSenha });
  }
  const hash = await bcrypt.hash(novaSenha, 12);
  await salvarHashLegado(userId, hash);
  await registrarAudit(caller.id, "REDEFINIR_SENHA_ADMIN", {
    usuarioId: userId,
    nome: userData.name || "",
  }, { usuarioId: userId });
  return { ok: true };
});

/**
 * Público — recuperação de senha validando CPF do usuário e do interno.
 * Se `novaSenha` for `__VALIDACAO__`, APENAS valida os CPFs (não troca a senha),
 * usado pelo fluxo "Esqueci minha senha" (passo 1 de verificação).
 * Protegido contra brute force por janela de tentativas (5 por 10 min por CPF).
 */
exports.redefinirSenhaPublica = onCall(async (request) => {
  const cpf = cleanCpf(request.data?.cpf);
  const cpfInterno = cleanCpf(request.data?.cpfInterno);
  const nomeCompleto = String(request.data?.nomeCompleto || "").trim().toLowerCase().replace(/\s+/g, " ");
  const apenasValidacao = String(request.data?.novaSenha || "") === "__VALIDACAO__";
  const novaSenha = apenasValidacao ? "" : validarSenha(request.data?.novaSenha);
  if (cpf.length !== 11) throw new HttpsError("invalid-argument", "CPF do usuário inválido.");
  if (cpfInterno.length !== 11) throw new HttpsError("invalid-argument", "CPF do interno inválido.");

  const usuario = await usuarioPorCpf(cpf);
  if (!usuario) throw new HttpsError("not-found", "Usuário não encontrado.");

  // NUNCA permitir recuperação pública de contas administrativas — um atacante
  // não pode tomar o painel com 2 CPFs conhecidos.
  const roleDoc = String(usuario.role || "").toLowerCase();
  if (["admin", "master"].includes(roleDoc)) {
    throw new HttpsError("permission-denied", "Recuperação pública não disponível para contas administrativas.");
  }

  const cpfInternoDoc = cleanCpf(usuario.inmateCpf || usuario.prisonerCpf || "");
  if (cpfInternoDoc !== cpfInterno) {
    throw new HttpsError("permission-denied", "CPF do interno não confere com o cadastro.");
  }

  // Fator adicional de conhecimento: o nome completo cadastrado deve bater.
  // (CPF de usuário + CPF de interno são semi-públicos entre familiares; o
  // nome completo reduz drasticamente a superfície de tomada de conta.)
  if (!nomeCompleto) {
    throw new HttpsError("invalid-argument", "Informe o nome completo cadastrado.");
  }
  const nomeDoc = String(usuario.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!nomeDoc || nomeDoc !== nomeCompleto) {
    throw new HttpsError("permission-denied", "Nome completo não confere com o cadastro.");
  }

  // Contagem de tentativas somente após confirmar que o CPF pertence a um usuário válido
  const bloqueioRef = db.collection("security_events").doc("rec_" + cpf);
  const bloqueio = await bloqueioRef.get();
  if (bloqueio.exists) {
    const bd = bloqueio.data();
    const janelaMs = 30 * 60 * 1000;
    const primeiro = bd.primeiraTentativa ? new Date(bd.primeiraTentativa).getTime() : 0;
    if (Date.now() - primeiro < janelaMs && (Number(bd.contagem) || 0) >= 5) {
      throw new HttpsError(
        "resource-exhausted",
        "Muitas tentativas de recuperação para este CPF. Aguarde 30 minutos."
      );
    }
    if (Date.now() - primeiro >= janelaMs) {
      await bloqueioRef.set({ contagem: 1, primeiraTentativa: new Date().toISOString() });
    } else {
      await bloqueioRef.update({ contagem: admin.firestore.FieldValue.increment(1) });
    }
  } else {
    await bloqueioRef.set({ contagem: 1, primeiraTentativa: new Date().toISOString() });
  }

  if (apenasValidacao) {
    return { ok: true, validado: true };
  }

  if (usuario.authUid) {
    await admin.auth().updateUser(usuario.authUid, { password: novaSenha });
  }
  const hash = await bcrypt.hash(novaSenha, 12);
  await salvarHashLegado(usuario.id, hash);
  await registrarAudit(usuario.id, "RECUPERAR_SENHA_PUBLICA", null, { usuarioId: usuario.id });
  await bloqueioRef.delete();
  return { ok: true, validado: true };
});

// ──────────────────────────────────────────────
// CARTEIRA (SALDO) — SOMENTE NO SERVIDOR
// ──────────────────────────────────────────────

/** Admin — aprova depósito PIX (credita saldo). */
exports.aprovarDeposito = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "wallet");
  const tid = String(request.data?.transacaoId || "");
  if (!tid) throw new HttpsError("invalid-argument", "Transação inválida.");

  let novoSaldoFinal = null;
  let valorDepositado = null;
  let usuarioIdDeposito = null;
  let motivoDuplicado = null;
  try {
    // ─── PRÉ-VALIDAÇÃO (fora da transação) ────────────────────────────────
    // Checa status, dono, E valida que o arquivo realmente EXISTE no Storage
    // com tamanho mínimo de comprovante real (3 KB). Fecha a brecha de URLs
    // que apontam para objeto inexistente ou arquivo vazio.
    const preSnap = await db.collection("wallet_transactions").doc(tid).get();
    if (!preSnap.exists) throw new Error("Transação não encontrada.");
    const pre = preSnap.data();
    if (pre.status !== "pending") throw new Error("Esta transação já foi processada.");
    if (pre.type !== "deposit") throw new Error("Transação não é um depósito.");
    if (!(Number(pre.amount) > 0)) throw new Error("Valor de depósito inválido.");
    if (Number(pre.amount) > 100000) throw new Error("Valor de depósito acima do teto permitido (R$ 100.000,00).");
    const comprovante = String(pre.proofUrl || "").trim();
    if (!comprovante || comprovante === "PENDENTE_UPLOAD_LOCAL_CACHE") {
      throw new Error("Depósito sem comprovante válido. Exija o envio da imagem do comprovante.");
    }
    // Validação flexível: arquivo real + dedup por hash/URL + avisa se pasta ≠ usuário
    const validacao = await validarComprovanteFlexivel(
      comprovante,
      pre.userId,
      "wallet_proofs",
      pre.proofHash,
      pre.proofSize,
      pre.proofMime,
      tid // docIdAtual: ignora o PRÓPRIO depósito na dedup
    );
    if (!validacao.ok) throw new Error(validacao.motivo);
    if (validacao.warning) logger.warn(`[aprovarDeposito] ${validacao.warning} tid=${tid}`);

    // ─── TRANSAÇÃO ATÔMICA ────────────────────────────────────────────────
    await db.runTransaction(async (t) => {
      const tRef = db.collection("wallet_transactions").doc(tid);
      const tSnap = await t.get(tRef);
      if (!tSnap.exists) throw new Error("Transação não encontrada.");
      const tx = tSnap.data();
      if (tx.status !== "pending") throw new Error("Esta transação já foi processada.");
      if (tx.type !== "deposit") throw new Error("Transação não é um depósito.");
      if (!(Number(tx.amount) > 0)) throw new Error("Valor de depósito inválido.");
      if (Number(tx.amount) > 100000) throw new Error("Valor de depósito acima do teto permitido (R$ 100.000,00).");

      // ANTI-FRAUDE POR HASH: se o mesmo hash de comprovante já aparece em
      // outro depósito ativo (pending ou approved), rejeita automaticamente.
      // Auto-rejeita marcando status=rejected + motivo, depois lança erro
      // para a transação abortar (o crédito NUNCA é liberado).
      const provaHash = String(tx.proofHash || "").trim();
      if (provaHash) {
        try {
          const dupSnap = await t.get(db.collection("wallet_transactions").where("proofHash", "==", provaHash).limit(8));
          const duplicatas = dupSnap.docs.filter((d) => {
            const s = String(d.data().status || "").toLowerCase();
            return d.id !== tid && s !== "rejected";
          });
          if (duplicatas.length > 0) {
            motivoDuplicado = `Comprovante já utilizado em outra transação (${duplicatas[0].id}). Recusado automaticamente pelo sistema.`;
            // NÃO grava aqui: a transação ainda vai abortar e ROLLBACK apaga
            // qualquer escrita. A persistência do status=rejected acontece no
            // catch, fora da transação.
            throw new Error("DUPLICATED_PROOF");
          }
        } catch (e) {
          if (e.message === "DUPLICATED_PROOF") throw e;
          // Se a query falhar, mantém o fluxo — a verificação do objeto
          // pelo Storage já é uma proteção forte.
        }
      }

      const uRef = db.collection("users").doc(tx.userId);
      const uSnap = await t.get(uRef);
      if (!uSnap.exists) throw new Error("Usuário não encontrado.");

      // ATÔMICO: evita race condition entre aprovações simultâneas
      t.update(uRef, { walletBalance: admin.firestore.FieldValue.increment(arredondar(tx.amount || 0)) });
      valorDepositado = arredondar(tx.amount || 0);
      usuarioIdDeposito = tx.userId;

      t.update(tRef, { status: "approved", approvedBy: caller.name || caller.id, approvedAt: new Date().toISOString() });
    });
    // Read-after-write: lê o saldo REAL após a transação commitar
    // (FieldValue.increment é atômico mas o snapshot dentro da transação
    // não reflete increments concorrentes — o valor real só existe após commit).
    const userSnapAfter = await db.collection("users").doc(usuarioIdDeposito).get();
    novoSaldoFinal = arredondar(Number(userSnapAfter.data()?.walletBalance || 0));
  } catch (e) {
    if (typeof e?.message === "string" && e.message === "DUPLICATED_PROOF") {
      // A transação abortou (rollback), então grava a rejeição FORA dela.
      // O crédito NUNCA é liberado; a gravação é best-effort — se falhar,
      // a transação permanece pending e o admin vê o motivo no erro.
      await db.collection("wallet_transactions").doc(tid).update({
        status: "rejected",
        rejectReason: motivoDuplicado || "Comprovante duplicado.",
        rejectedBy: "SISTEMA",
        rejectedAt: new Date().toISOString(),
      }).catch(() => {});
      throw new HttpsError("already-exists", "Comprovante já utilizado em outro depósito. Depósito recusado automaticamente.");
    }
    throw new HttpsError("invalid-argument", "Falha ao aprovar depósito. Tente novamente.");
  }

  await registrarAudit(caller.id, "LIBERAR_CREDITO_DEPOSITO", {
    transacaoId: tid,
    usuarioId: usuarioIdDeposito,
  }, {
    transacaoId: tid,
    usuarioId: usuarioIdDeposito,
    valor: valorDepositado,
    novoSaldo: novoSaldoFinal,
  });

  return { ok: true, novoSaldo: novoSaldoFinal };
});

/** Admin — recusa depósito PIX. */
exports.rejeitarDeposito = onCall(async (request) => {
  const caller = await exigirAdmin(request);
  const tid = String(request.data?.transacaoId || "");
  if (!tid) throw new HttpsError("invalid-argument", "Transação inválida.");
  const motivo = String(request.data?.motivo || "").slice(0, 200);

  let usuarioIdDeposito = null;
  try {
    await db.runTransaction(async (t) => {
      const tRef = db.collection("wallet_transactions").doc(tid);
      const tSnap = await t.get(tRef);
      if (!tSnap.exists) throw new Error("Transação não encontrada.");
      if (tSnap.data().status !== "pending") throw new Error("Esta transação já foi processada.");
      usuarioIdDeposito = tSnap.data().userId || null;
      t.update(tRef, {
        status: "rejected",
        rejectReason: motivo,
        rejectedBy: caller.name || caller.id,
        rejectedAt: new Date().toISOString(),
      });
    });
  } catch (e) {
    throw new HttpsError("invalid-argument", "Falha ao rejeitar depósito. Tente novamente.");
  }

  await registrarAudit(caller.id, "REJEITAR_DEPOSITO", { transacaoId: tid, usuarioId: usuarioIdDeposito }, { transacaoId: tid, usuarioId: usuarioIdDeposito, motivo });
  return { ok: true };
});

/** Admin principal — crédito direto de saldo (aporte manual). */
exports.creditarSaldo = onCall(async (request) => {
  const caller = await exigirAdminPrincipal(request);
  const userId = String(request.data?.userId || "");
  const valor = validarValor(request.data?.valor);
  const motivo = String(request.data?.motivo || "Crédito administrativo").slice(0, 200);
  logger.info(`[creditarSaldo] operador=${caller.id} usuario=${userId} valor=${valor}`);

  // SEGURANÇA (LGPD/auditoria): aporte manual de crédito exige a SENHA
  // SECUNDÁRIA (mestra), validada no servidor com bcrypt + rate limit.
  // Sem hash configurado a operação fica BLOQUEADA (falha segura).
  verificarRateLimit("creditarSaldo:" + caller.id, 10);
  await verificarSenhaMestra(request.data?.senhaMestra);
  logger.info(`[creditarSaldo] senha validada — executando operação (${caller.id})`);

  let novoSaldoFinal = null;
  let saldoAnterior = null;
  let usuarioAlvo = null;
  await db.runTransaction(async (t) => {
    const uRef = db.collection("users").doc(userId);
    const uSnap = await t.get(uRef);
    if (!uSnap.exists) throw new Error("Usuário não encontrado.");
    const ud = uSnap.data();

    // ATÔMICO: evita race condition entre créditos manuais simultâneos
    t.update(uRef, { walletBalance: admin.firestore.FieldValue.increment(arredondar(valor)) });
    saldoAnterior = arredondar(Number(ud.walletBalance || 0));
    usuarioAlvo = ud.name || userId;
    await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
      userId,
      inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ud.cpf),
      amount: valor,
      proofUrl: "",
      status: "approved",
      createdAt: new Date().toISOString(),
      type: "deposit",
      description: motivo,
      payerName: caller.name || "Administrador",
      payerId: caller.id,
    });
  });
  // Read-after-write: saldo REAL após commit
  const snapAfter = await db.collection("users").doc(userId).get();
  novoSaldoFinal = arredondar(Number(snapAfter.data()?.walletBalance || 0));

  await registrarAudit(caller.id, "CREDITO_MANUAL", {
    usuarioId: userId,
    nome: usuarioAlvo,
    saldoAnterior,
  }, {
    usuarioId: userId,
    nome: usuarioAlvo,
    valor,
    novoSaldo: novoSaldoFinal,
    motivo,
  });

  return { ok: true, novoSaldo: novoSaldoFinal };
});

/**
 * Admin — zera o saldo de TODAS as carteiras de usuários (ex.: fim de mês).
 * Server-side via admin SDK: as regras bloqueiam edição de walletBalance no
 * cliente por design; antes, a tela "Zerar Créditos" falhava silenciosamente.
 * Gera uma transação 'correction' por carteira para manter o extrato coerente.
 * CORREÇÃO: usa transação por chunk (até 300 docs) para evitar race condition
 * com depósitos/aprovações simultâneos — lê o saldo ATUAL dentro da transação
 * e só zera se ainda > 0.
 */
exports.zerarCarteiras = onCall(async (request) => {
  const caller = await exigirAdmin(request);
  verificarRateLimit("zerarCarteiras:" + caller.id, 3);
  logger.info(`[zerarCarteiras] operador=${caller.id}`);

  const antes = [];
  const agora = new Date().toISOString();
  let lastDoc = null;

  while (true) {
    let q = db.collection("users").where("walletBalance", ">", 0)
      .orderBy("walletBalance").limit(300);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    // Processa cada usuário em transação individual (seguro contra race conditions)
    // Chunk de 300 → 300 transações pequenas, mas atômicas por usuário.
    for (const docSnap of snap.docs) {
      await db.runTransaction(async (t) => {
        const freshSnap = await t.get(docSnap.ref);
        if (!freshSnap.exists) return;
        const fresh = freshSnap.data();
        const saldo = arredondar(Number(fresh.walletBalance || 0));
        if (saldo <= 0) return;
        antes.push({ id: docSnap.id, nome: fresh.name || "", saldo });
        t.update(docSnap.ref, { walletBalance: 0 });
        registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
          userId: docSnap.id,
          amount: -saldo,
          type: "correction",
          status: "approved",
          description: "Zeragem de créditos (reset manual)",
          createdAt: agora,
          proofUrl: "",
          payerName: caller.name || "Administrador",
          payerId: caller.id,
        });
      });
    }
    if (snap.docs.length < 300) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  await registrarAudit(caller.id, "ZERAR_CREDITOS", { usuariosComSaldo: antes }, {
    totalZeradas: antes.length,
  });

  return { ok: true, totalZeradas: antes.length };
});

/** Admin PRINCIPAL — retirada de saldo (débito) de qualquer usuário.
 *  O dinheiro SAI da gaveta: exige senha mestra (bcrypt + rate limit),
 *  mesmo nível de segurança do aporte de crédito (creditarSaldo). */
exports.sacarSaldoAdmin = onCall(async (request) => {
  const caller = await exigirAdminPrincipal(request);
  const userId = String(request.data?.userId || "");
  const valor = validarValor(request.data?.valor);
  const motivo = String(request.data?.motivo || "Retirada de crédito").slice(0, 200);
  logger.info(`[sacarSaldoAdmin] operador=${caller.id} usuario=${userId} valor=${valor}`);

  verificarRateLimit("sacarSaldoAdmin:" + caller.id, 10);
  await verificarSenhaMestra(request.data?.senhaMestra);

  // Caixa físico: o dinheiro pago ao cliente sai da gaveta — registra a sangria
  // automática na sessão aberta do operador (se houver), mesmo padrão das vendas.
  let sessaoSaque = null;
  try { sessaoSaque = await getSessaoCaixaAberta(caller.id); } catch (e) { /* caixa opcional */ }

  let novoSaldoFinal = null;
  let saldoAnterior = null;
  let usuarioAlvo = null;
  await db.runTransaction(async (t) => {
    const uRef = db.collection("users").doc(userId);
    const uSnap = await t.get(uRef);
    if (!uSnap.exists) throw new Error("Usuário não encontrado.");
    const ud = uSnap.data();
    if (Number(ud.walletBalance || 0) < valor) throw new Error("Saldo insuficiente.");

    // ATÔMICO: evita race condition entre saques simultâneos
    t.update(uRef, { walletBalance: admin.firestore.FieldValue.increment(-arredondar(valor)) });
    saldoAnterior = arredondar(Number(ud.walletBalance || 0));
    usuarioAlvo = ud.name || userId;
    await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
      userId,
      inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ud.cpf),
      amount: -valor,
      proofUrl: "",
      status: "approved",
      createdAt: new Date().toISOString(),
      type: "withdrawal",
      description: motivo,
      payerName: caller.name || "Administrador",
      payerId: caller.id,
    });

    if (sessaoSaque) {
      const sessaoSnap = await t.get(refSessaoCaixa(sessaoSaque));
      if (sessaoSnap.exists && String(sessaoSnap.data().status || "").toUpperCase() === "OPEN") {
        const payloadSaque = {
          currentBalance: admin.firestore.FieldValue.increment(-valor),
          withdrawals: admin.firestore.FieldValue.arrayUnion({
            amount: valor,
            reason: `Retirada de crédito - ${usuarioAlvo || userId}`,
            timestamp: admin.firestore.Timestamp.now(),
          }),
        };
        if (sessaoSaque.colecao !== "cash_sessions") {
          payloadSaque.totalEntries = admin.firestore.FieldValue.increment(-valor);
        }
        t.update(sessaoSnap.ref, payloadSaque);
      }
    }
  });
  // Read-after-write: saldo REAL após commit
  const snapAfter = await db.collection("users").doc(userId).get();
  novoSaldoFinal = arredondar(Number(snapAfter.data()?.walletBalance || 0));

  await registrarAudit(caller.id, "SAQUE_ADMIN", {
    usuarioId: userId,
    nome: usuarioAlvo,
    saldoAnterior,
  }, {
    usuarioId: userId,
    nome: usuarioAlvo,
    valor,
    novoSaldo: novoSaldoFinal,
    motivo,
  });

  return { ok: true, novoSaldo: novoSaldoFinal };
});

/** Autenticado — saque do próprio saldo. */
exports.sacarSaldoProprio = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  const valor = validarValor(request.data?.valor);

  let novoSaldoFinal = null;
  await db.runTransaction(async (t) => {
    const uRef = db.collection("users").doc(user.id);
    const uSnap = await t.get(uRef);
    if (!uSnap.exists) throw new Error("Usuário não encontrado.");
    const ud = uSnap.data();
    validarSaldoSuficiente(ud.walletBalance || 0, valor);
    novoSaldoFinal = calcularNovoSaldo(ud.walletBalance || 0, valor);
    t.update(uRef, { walletBalance: admin.firestore.FieldValue.increment(-arredondar(valor)) });
    await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
      userId: user.id,
      inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ud.cpf),
      amount: -valor,
      proofUrl: "",
      status: "approved",
      createdAt: new Date().toISOString(),
      type: "withdrawal",
      description: "Saque realizado pelo usuário",
      payerName: user.name || "",
      payerId: user.id,
    });
  });

  await registrarAudit(user.id, "SAQUE_PROPRIO", null, {
    valor,
    novoSaldo: novoSaldoFinal,
  });

  return { ok: true, novoSaldo: novoSaldoFinal };
});

// ──────────────────────────────────────────────
// VENDAS E PEDIDOS — PROCESSADOS NO SERVIDOR
// ──────────────────────────────────────────────

function validarItens(itens) {
  try {
    return validarItensPuros(itens);
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }
}

/**
 * Valida se uma URL de Storage pertence ao bucket do projeto e à pasta privada
 * do usuário ({pasta}/{uid}/...). Impede usar comprovante de outro usuário ou
 * de outro projeto Firebase para confirmar um pedido/depósito.
 */
async function comprovanteEhDoUsuario(url, uid, pasta) {
  const u = String(url || "").trim();
  if (!u.startsWith("https://firebasestorage.googleapis.com/v0/b/")) return false;
  // Usa FUNC_BUCKET (env var do projeto) em vez de nomes hardcoded
  const bucket = FUNC_BUCKET || "mercado-facil-mt.appspot.com";
  if (!u.includes(bucket) && !u.includes(bucket.replace(".appspot.com", ".firebasestorage.app"))) return false;
  // Usuários migrados têm o documento com id == UID do Auth; usuários legados
  // ainda podem ter id antigo com o campo authUid apontando para o UID real.
  // O upload no app usa o UID do Auth, então a validação tem que aceitar
  // TANTO o id do documento QUANTO o authUid na pasta da URL.
  let primaryId = "";
  let authUid = null;
  if (uid && typeof uid === "object") {
    primaryId = uid.id || uid.uid || "";
    authUid = uid.authUid || null;
  } else {
    primaryId = String(uid || "");
    try {
      const snap = await db.collection("users").doc(primaryId).get();
      if (snap.exists) authUid = snap.data().authUid || null;
    } catch (e) {
      authUid = null;
    }
  }
  const marcador1 = encodeURIComponent(`${pasta}/${primaryId}/`);
  const marcador2 = authUid ? encodeURIComponent(`${pasta}/${authUid}/`) : null;
  return u.includes(marcador1) || Boolean(marcador2 && u.includes(marcador2));
}

// Tamanho mínimo de um comprovante real (foto de recibo, screenshot do app do
// banco ou PDF). Abaixo disso é arquivo vazio/fragmento — recusado.
const MIN_PROOF_BYTES = 3 * 1024;

/**
 * ANTI-FRAUDE: confirma que o comprovante EXISTE de verdade no Storage, está
 * na pasta permitida, tem tamanho de arquivo real e tipo de mídia permitido.
 * Fecha a brecha de URLs que apontam para um objeto inexistente (a checagem de
 * dono só validava o prefixo da URL, não o arquivo).
 * Retorna { ok, size, mime } ou { ok:false, motivo }.
 */
async function verificarObjetoComprovante(url, pasta) {
  const caminho = caminhoStorageDeUrl(url, FUNC_BUCKET);
  if (!caminho) return { ok: false, motivo: "URL de comprovante inválida." };
  if (!caminho.startsWith(pasta + "/")) {
    return { ok: false, motivo: "Comprovante fora da pasta permitida." };
  }
  try {
    const file = admin.storage().bucket(FUNC_BUCKET).file(caminho);
    const [meta] = await file.getMetadata();
    const size = Number(meta?.size || 0);
    if (!size) return { ok: false, motivo: "Arquivo do comprovante não encontrado no Storage." };
    if (size < MIN_PROOF_BYTES) {
      return { ok: false, motivo: "Comprovante suspeito: arquivo muito pequeno para ser um recibo real." };
    }
    const mime = String(meta?.contentType || "").toLowerCase();
    const permitido = mime.startsWith("image/") || mime === "application/pdf";
    if (!permitido) return { ok: false, motivo: "Tipo de arquivo de comprovante não permitido." };
    return { ok: true, size, mime };
  } catch (e) {
    return { ok: false, motivo: "Falha ao verificar o comprovante no Storage. Tente novamente." };
  }
}

/**
 * Validação flexível de comprovante — permite comprovante de familiar/terceiro.
 * 1) Sempre valida arquivo real no Storage (existência, tamanho ≥3KB, tipo imagem/PDF)
 * 2) Deduplicação por HASH (SHA-256) — mesmo arquivo = mesmo hash = bloqueia
 * 3) Fallback: deduplicação por URL + metadados (size/mime) como heurística
 * 4) Se pasta do arquivo ≠ userId, loga warning de auditoria mas NÃO bloqueia
 *    (caso legítimo: familiar paga pelo interno, depósito em conta de terceiro).
 * Retorna { ok: true/false, motivo?, warning?: string, meta?: {size, mime} }
 */
async function validarComprovanteFlexivel(proofUrl, userId, pasta, proofHash, proofSize, proofMime, docIdAtual) {
  const url = String(proofUrl || "").trim();
  if (!url || url === "PENDENTE_UPLOAD_LOCAL_CACHE") {
    return { ok: false, motivo: "Comprovante não enviado." };
  }

  // 1) Validação real do arquivo no Storage (obrigatória)
  const objCheck = await verificarObjetoComprovante(url, pasta);
  if (!objCheck.ok) {
    return { ok: false, motivo: objCheck.motivo };
  }

  // Status que NÃO contam como duplicata (registro já finalizado/cancelado).
  // Depósitos: só rejected/cancelled liberam reuso; pedidos: qualquer terminal.
  const EXCLUIR_STATUS = pasta === "wallet_proofs"
    ? ["rejected", "cancelled", "cancelado"]
    : ["cancelled", "cancelado", "canceled", "refunded", "returned", "devolvido", "estornado", "reembolsado", "rejected", "rejeitado"];
  const ativo = (d) => d.id !== docIdAtual && !EXCLUIR_STATUS.includes(String(d.data().status || "").toLowerCase());

  const colecao = pasta === "wallet_proofs" ? "wallet_transactions" : "orders";

  // 2) Deduplicação por HASH (primária — identidade do conteúdo)
  // IMPORTANTE: filtra o PRÓPRIO documento (docIdAtual). Sem isso, ao aprovar
  // um pedido/depósito, a query encontra o próprio registro (status ainda
  // pending) e bloqueia a aprovação achando que o comprovante é duplicado.
  // Query de CAMPO ÚNICO (índice automático) + filtro de status em memória:
  // não depende de índice composto (proofHash+status) — evita o erro "internal"
  // quando o índice ainda não existe no Firestore.
  if (proofHash && proofHash.trim()) {
    try {
      const dupSnap = await db.collection(colecao)
        .where("proofHash", "==", proofHash.trim())
        .limit(30)
        .get();
      const dup = dupSnap.docs.find(ativo);
      if (dup) {
        return { ok: false, motivo: `Comprovante já utilizado em ${pasta === "wallet_proofs" ? "outro depósito" : "outro pedido"} (#${dup.id}). Cada comprovante só pode ser usado uma vez.` };
      }
    } catch (e) {
      // Dedup por hash indisponível → não bloqueia; a validação do arquivo
      // real no Storage + o fallback por URL ainda protegem.
      logger.warn(`[validarComprovanteFlexivel] Dedup por hash indisponível: ${e.message}`);
    }
  }

  // 3) Fallback: dedup por URL (se não há hash ou query falhou)
  // Usa metadados do arquivo (size/mime) como heurística extra.
  // Mesma política de índice único + filtro em memória.
  const size = Number(proofSize || objCheck.size || 0);
  const mime = String(proofMime || objCheck.mime || "").toLowerCase();
  const campoUrl = pasta === "wallet_proofs" ? "proofUrl" : "paymentProofUrl";

  try {
    const urlSnap = await db.collection(colecao)
      .where(campoUrl, "==", url)
      .limit(30)
      .get();
    const dupUrl = urlSnap.docs.find(ativo);
    if (dupUrl) {
      // Heurística: se size/mime batem, é quase certeza ser o mesmo arquivo
      const outroSize = Number(dupUrl.data().proofSize || 0);
      const outroMime = String(dupUrl.data().proofMime || "").toLowerCase();
      if (size > 0 && outroSize > 0 && size === outroSize && mime && outroMime === mime) {
        return { ok: false, motivo: `Comprovante já utilizado em ${pasta === "wallet_proofs" ? "outro depósito" : "outro pedido"} (#${dupUrl.id}).` };
      }
    }
  } catch (e) {
    // Se query falhar, ignora — validação de arquivo real já passou
  }

  // 4) Auditoria: se pasta ≠ userId, loga warning (não bloqueia)
  let warning = null;
  const ehDono = await comprovanteEhDoUsuario(url, userId, pasta);
  if (!ehDono) {
    warning = `Atenção: comprovante está na pasta de outro usuário (${pasta}/${userId}). Verifique se é pagamento de familiar/terceiro.`;
  }

  return { ok: true, meta: { size: objCheck.size, mime: objCheck.mime }, warning };
}

/** Lê produtos e valida estoque. Retorna { itens, total }. */
async function prepararItensServidor(t, itens) {
  const snaps = await Promise.all(itens.map((i) => t.get(db.collection("products").doc(i.productId))));
  const resultado = [];
  let total = 0;
  snaps.forEach((snap, idx) => {
    if (!snap.exists) throw new Error(`Produto não encontrado: ${itens[idx].productId}`);
    const p = snap.data();
    if ((p.stock || 0) < itens[idx].quantity) throw new Error(`Estoque insuficiente: ${p.name || itens[idx].productId}`);
    // Preço promocional (promoPrice) é a fonte da verdade quando ativo:
    // o cliente vê e é cobrado pelo preço anunciado na vitrine.
    const preco = Number(p.promoPrice) > 0 ? Number(p.promoPrice) : (Number(p.price) || 0);
    total = arredondar(total + preco * itens[idx].quantity);
    resultado.push({
      productId: itens[idx].productId,
      name: p.name || "Produto",
      quantity: itens[idx].quantity,
      priceAtPurchase: arredondar(preco),
      category: p.category || "Geral",
      brand: p.brand || "",
    });
  });
  if (total <= 0) throw new Error("Total da venda inválido.");
  return { resultado, total };
}

function debitarEstoque(t, itensComPreco) {
  itensComPreco.forEach((item) => {
    t.update(db.collection("products").doc(item.productId), {
      stock: admin.firestore.FieldValue.increment(-item.quantity),
      lastSoldAt: new Date().toISOString(),
    });
  });
}

function refSessaoCaixa(sessao) {
  return sessao && sessao.colecao === "cash_sessions"
    ? db.collection("cash_sessions").doc(sessao.id)
    : db.collection("cashier").doc(sessao.id);
}

async function getSessaoCaixaAberta(operatorId) {
  // 1) PDV moderno (coleção cash_sessions, status minúsculo "open").
  //    Filtro de status feito em memória para não depender de índice composto.
  const snap1 = await db.collection("cash_sessions")
    .where("operatorId", "==", operatorId)
    .limit(100)
    .get();
  const ativa1 = snap1.docs.find((d) => String(d.data().status || "").toLowerCase() === "open");
  if (ativa1) {
    return { id: ativa1.id, colecao: "cash_sessions", ...ativa1.data() };
  }
  // 2) Legado (coleção cashier, status maiúsculo "OPEN")
  const snap2 = await db.collection("cashier")
    .where("status", "==", "OPEN")
    .limit(20)
    .get();
  const sessao = snap2.docs
    .map((d) => ({ id: d.id, colecao: "cashier", ...d.data() }))
    .find((s) => s.operatorId === operatorId || s.openedBy === operatorId);
  return sessao || null;
}

/** Resolve a sessão de caixa vigente na data do pedido (para estorno).
 *  Ordem = mesma da venda: PDV (cash_sessions) primeiro, legado (cashier) depois. */
async function resolverSessaoCaixaDoPedido(pedido) {
  const momento = new Date(pedido.date).getTime();
  // 1) PDV moderno: sessão em cash_sessions aberta na data do pedido
  const snap = await db.collection("cash_sessions")
    .where("operatorId", "==", (pedido.operatorId || ""))
    .limit(100)
    .get();
  const sessao = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((s) => {
      const ab = s.openedAt ? (s.openedAt.toDate ? s.openedAt.toDate().getTime() : new Date((s.openedAt.seconds || 0) * 1000).getTime()) : 0;
      if (!ab || ab > momento) return false;
      if (s.closedAt) {
        const fe = s.closedAt.toDate ? s.closedAt.toDate().getTime() : new Date((s.closedAt.seconds || 0) * 1000).getTime();
        if (fe < momento) return false;
      }
      return true;
    });
  if (sessao) {
    return { ref: db.collection("cash_sessions").doc(sessao.id), colecao: "cash_sessions", status: sessao.status };
  }
  // 2) Legado: sessão diária em cashier (id = data)
  const dataStr = String(pedido.date).split("T")[0];
  const legadoRef = db.collection("cashier").doc(dataStr);
  const legadoSnap = await legadoRef.get();
  if (legadoSnap.exists) {
    return { ref: legadoRef, colecao: "cashier", status: legadoSnap.data().status };
  }
  return null;
}

/**
 * Guarda de idempotência de vendas (anti duplicatas por toque duplo/timeout):
 * o app gera um clientToken por tentativa lógica de venda e o reutiliza em
 * reenvios. A primeira chamada grava a marca na transação; qualquer replay
 * com o mesmo token DEVOLVE o pedido já criado, sem debitar estoque/saldo.
 *
 * FASE 1 (leitura, DEVE vir antes de qualquer write da transação):
 * retorna { deduplicado: true, order } se o token já foi usado, ou null.
 */
async function verificarIdempotenciaVenda(t, clientToken, userId) {
  const token = sanitizarToken(clientToken);
  if (!token) return null;
  const reqRef = db.collection("request_guard").doc(`venda_${token}`);
  const reqSnap = await t.get(reqRef);
  if (reqSnap.exists) {
    const r = reqSnap.data();
    if (r.type === "venda" && r.userId === userId && r.orderId) {
      const orderSnap = await t.get(db.collection("orders").doc(r.orderId));
      if (orderSnap.exists) {
        return { deduplicado: true, order: orderSnap.data() };
      }
    }
    throw new Error("Requisição duplicada (token já utilizado).");
  }
  return null;
}

/**
 * FASE 2 (escrita, chamar no FINAL da transação, depois de todos os reads):
 * grava a marca do token apontando para o pedido recém-criado.
 */
function marcarIdempotenciaVenda(t, clientToken, userId, orderId) {
  const token = sanitizarToken(clientToken);
  if (!token) return;
  t.set(db.collection("request_guard").doc(`venda_${token}`), {
    type: "venda",
    userId,
    orderId,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

function lerClientToken(data) {
  return sanitizarToken(data?.clientToken);
}

/**
 * Admin — venda no PDV. Calcula TUDO no servidor (preços, saldo, estoque),
 * debita carteira quando houver, registra caixa físico e cria o pedido.
 */
exports.processarVendaAdmin = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "sales");
  const targetUserId = String(request.data?.targetUserId || "balcao_anonimo");
  const paymentMethod = String(request.data?.paymentMethod || "CASH");
  const cardBrand = paymentMethod === "CARD"
    ? String(request.data?.cardBrand || "").replace(/[^A-Za-z0-9áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ ]/g, "").slice(0, 20).trim()
    : "";
  const itens = validarItens(request.data?.items);
  // Normalização server-side (defesa em profundidade): arredonda para centavos e
  // normaliza o método para UPPERCASE ANTES de calcular partes e de PERSISTIR no
  // pedido — impede que ruído de ponto flutuante vindo do frontend (ex. troco
  // 0.30000000000000004) seja gravado no histórico/relatórios.
  const payments = Array.isArray(request.data?.payments)
    ? request.data.payments
        .map((p) => ({
          method: String((p && p.method) || "").toUpperCase(),
          amount: arredondar(Number((p && p.amount) || 0)),
        }))
        .filter((p) => p.method && p.amount > 0)
    : undefined;
  const changeRaw = request.data?.change;
  if (changeRaw !== undefined && changeRaw !== null && !Number.isFinite(Number(changeRaw))) {
    throw new HttpsError("invalid-argument", "Troco inválido.");
  }
  const change = changeRaw === undefined || changeRaw === null ? undefined : arredondar(Number(changeRaw));
  const customerAccountId = request.data?.customerAccountId ? String(request.data.customerAccountId) : null;

  const isConsumer = targetUserId === "consumidor_geral" || targetUserId === "balcao_anonimo";
  const metodosValidos = ["PIX", "WALLET", "CASH", "CARD", "FIADO", "FIADO_30", "MIXED"];
  if (!metodosValidos.includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  }

  // Gate de segurança: venda FIADA (FIADO e FIADO_30) exige a DUPLA senha mestra
  // validada AQUI no servidor (primária + secundária). O front já valida, mas
  // revalidar no backend impede que uma sessão autenticada pule a etapa via
  // chamada direta. Vendas sincronizadas de fila offline são isentas porque a
  // senha não pode ser validada sem rede. A isenção SÓ vale para a fila real:
  // clientToken com o prefixo OFFLINE_ (padrão do offlineQueue) + flag
  // origemOffline=true — evita que a flag sozinha seja forjada por um cliente.
  const ehOfflineFiado =
    request.data?.origemOffline === true &&
    String(request.data?.clientToken || "").startsWith("OFFLINE_");
  if ((paymentMethod === "FIADO" || paymentMethod === "FIADO_30") && !ehOfflineFiado) {
    const apiKey = String(request.data?.apiKey || "") || process.env.FIREBASE_API_KEY || "";
    if (paymentMethod === "FIADO_30") {
      // FIADO_30 NÃO é venda fiada tradicional em "conta" — é uma venda a prazo
      // (30 dias) contra o usuário cadastrado. Exige apenas UMA senha mestra:
      // qualquer uma das duas (primária de login OU secundária/master).
      const senhaUnica = String(request.data?.senhaPrimaria || "");
      if (!senhaUnica) {
        throw new HttpsError("invalid-argument", "Venda fiada de 30 dias exige a senha mestra do administrador.");
      }
      const unica = await validarSenhaUnicaServidor(caller, senhaUnica, apiKey);
      if (!unica.ok) {
        throw new HttpsError("permission-denied", "Uma das senhas está incorreta. Tente novamente.");
      }
    } else {
      const senhaPrimaria = String(request.data?.senhaPrimaria || "");
      const senhaSecundaria = String(request.data?.senhaSecundaria || "");
      if (!senhaPrimaria || !senhaSecundaria) {
        throw new HttpsError("invalid-argument", "Venda fiada exige a senha primária e a secundária do administrador.");
      }
      const dupla = await validarDuplaSenhaServidor(caller, senhaPrimaria, senhaSecundaria, apiKey);
      if (!dupla.ok) {
        throw new HttpsError("permission-denied", "Uma das senhas está incorreta. Tente novamente.");
      }
    }
  }

  // Partes de carteira/dinheiro são calculadas DENTRO da transação (total
  // server-side); aqui só detectamos a presença de dinheiro para resolver a
  // sessão de caixa antes de abrir a transação.
  const temParteCash = paymentMethod === "CASH" ||
    (paymentMethod === "MIXED" && (payments || []).some((p) => p.method === "CASH"));
  const temPartePix = paymentMethod === "PIX" ||
    (paymentMethod === "MIXED" && (payments || []).some((p) => p.method === "PIX"));

  const orderId = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase() : Math.random().toString(36).slice(2, 14)).toUpperCase();

  // Auditoria PIX: a venda só chega aqui DEPOIS que o operador confirmou o recebimento
  // (o frontend bloqueia a finalização sem confirmação). Registra quem/ quando confirmou.
  const pixConfirmacao = temPartePix
    ? {
        pixConfirmed: true,
        pixConfirmedBy: caller.id,
        pixConfirmedByNome: caller.name || "ADMIN",
        pixConfirmedAt: new Date().toISOString(),
      }
    : {};

  // Sessão de caixa física (coleção "cashier", gravada pelo frontend) —
  // o id é resolvido ANTES da transação, mas o doc é relido DENTRO dela.
  // Necessária para CASH puro E para MIXED com parte em dinheiro
  // (correção: antes, a parte em dinheiro do MIXED nunca era creditada no caixa).
  let sessaoCaixa = null;
  if (temParteCash) {
    sessaoCaixa = await getSessaoCaixaAberta(caller.id);
  }

  let resultado;
  try {
    resultado = await db.runTransaction(async (t) => {
      // Idempotência: reenvio com o mesmo clientToken devolve o pedido já criado.
      const guarda = await verificarIdempotenciaVenda(t, lerClientToken(request.data), caller.id);
      if (guarda) return { ...guarda.order, replay: true };
      const { resultado: itensComPreco, total } = await prepararItensServidor(t, itens);

      // Partes de carteira/dinheiro calculadas NO SERVIDOR (lógica pura testável)
      const { walletPortion, cashPortion } = calcularPartesPagamento(paymentMethod, payments, total, isConsumer);

    let userData = null;
    let userData2 = null;
    let clienteFiadoNome = null;

    const jointWalletReq = request.data?.jointWallet || null;
    const secondUserId = jointWalletReq ? String(jointWalletReq.secondUserId || "").trim() || null : null;
    // Split calculado pela função PURA (testada): rejeita 2ª parcela maior que
    // a parte de carteira — sem isso, um cliente malicioso podia debitar da
    // carteira do 2º devedor mais do que o total da venda.
    const splitVenda = calcularSplitVenda(walletPortion, jointWalletReq);
    const hasJointWallet = splitVenda.emDupla;
    const secondWalletAmount = splitVenda.segundaParcela;
    const firstUserWalletAmount = splitVenda.primeiraParcela;

    if (!isConsumer) {
      const uSnap = await t.get(db.collection("users").doc(targetUserId));
      if (uSnap.exists) {
        userData = { ...uSnap.data(), id: uSnap.id };
      } else if (walletPortion > 0) {
        throw new Error("Usuário não encontrado.");
      }
      if (walletPortion > 0) {
        if (Number(userData.walletBalance || 0) < firstUserWalletAmount) throw new Error("Saldo insuficiente na carteira do 1º devedor.");
        if (!userData.autorizacaoExcepcional) {
          const cfgSnap = await t.get(db.collection("settings").doc("general"));
          const cfg = cfgSnap.exists ? cfgSnap.data() : {};
          verificarLimiteSemanal(userData.weeklySpent || 0, firstUserWalletAmount, cfg.weeklyWalletLimit);
        }
      }
    }

    if (hasJointWallet && secondUserId) {
      if (secondUserId === targetUserId) throw new Error("O 2º devedor deve ser diferente do 1º usuário.");
      const uSnap2 = await t.get(db.collection("users").doc(secondUserId));
      if (!uSnap2.exists) throw new Error("2º devedor da venda em dupla não encontrado.");
      userData2 = { ...uSnap2.data(), id: uSnap2.id };
      if (Number(userData2.walletBalance || 0) < secondWalletAmount) {
        throw new Error("Saldo insuficiente na carteira do 2º devedor.");
      }
      if (!userData2.autorizacaoExcepcional) {
        const cfgSnap = await t.get(db.collection("settings").doc("general"));
        const cfg = cfgSnap.exists ? cfgSnap.data() : {};
        verificarLimiteSemanal(userData2.weeklySpent || 0, secondWalletAmount, cfg.weeklyWalletLimit);
      }
    }

    // FIADO: validação e registro de dívida NO SERVIDOR (atômico com a venda).
    // UNIFICADO: o cliente de fiado É o usuário cadastrado selecionado no PDV
    // (mesmo universo das vendas PIX/WALLET/CASH/CARD/MIXED). Nada de coleção
    // paralela customer_accounts — dívida/limite/gasto ficam no próprio doc do
    // usuário (users/<targetUserId>).
    if (paymentMethod === "FIADO") {
      if (isConsumer) throw new Error("Venda fiada exige usuário cadastrado.");
      if (!customerAccountId) throw new Error("Selecione o usuário cadastrado para o fiado.");
      if (!userData) throw new Error("Usuário de fiado não encontrado.");
      clienteFiadoNome = String(userData.name || userData.nome || "Fiado").slice(0, 80);
      if (String(userData.status || "").toLowerCase() === "blocked") {
        throw new Error("Usuário bloqueado para venda fiada.");
      }
      if (!userData.allowCredit && !userData.autorizacaoExcepcional) {
        throw new Error("Usuário sem permissão para venda fiada.");
      }
      // Grava o INÍCIO da dívida (debtStartedAt) apenas quando o cliente parte de
      // dívida zero — base para o PDV marcar "nota vencida após 30 dias" em Contas
      // a Receber. Mantém a data original enquanto houver débito em aberto.
      const updateParcial = {
        currentDebt: admin.firestore.FieldValue.increment(total),
        weeklySpent: admin.firestore.FieldValue.increment(total),
      };
      const dividaAntes = Number(userData?.currentDebt || 0);
      if (!(dividaAntes > 0)) {
        updateParcial.debtStartedAt = admin.firestore.Timestamp.now();
      }
      t.update(db.collection("users").doc(targetUserId), updateParcial);
    }

    // FIADO 30 DIAS: usa usuário cadastrado diretamente com vencimento em 30 dias.
    // Diferente do FIADO tradicional (que usa customerAccountId como conta separada),
    // o FIADO_30 usa o próprio targetUserId (usuário selecionado) e registra
    // debtDueAt = now + 30 dias para controle de vencimento.
    if (paymentMethod === "FIADO_30") {
      if (isConsumer) throw new Error("Fiado 30 Dias exige usuário cadastrado.");
      if (!customerAccountId) throw new Error("Selecione o usuário para o fiado 30 dias.");
      const fiado30UserId = customerAccountId;
      const fiado30UserSnap = await t.get(db.collection("users").doc(fiado30UserId));
      if (!fiado30UserSnap.exists) throw new Error("Usuário para fiado 30 dias não encontrado.");
      const fiado30UserData = { ...fiado30UserSnap.data(), id: fiado30UserSnap.id };
      clienteFiadoNome = String(fiado30UserData.name || fiado30UserData.nome || "Fiado 30").slice(0, 80);
      if (String(fiado30UserData.status || "").toLowerCase() === "blocked") {
        throw new Error("Usuário bloqueado para fiado 30 dias.");
      }
      if (!fiado30UserData.allowCredit && !fiado30UserData.autorizacaoExcepcional) {
        throw new Error("Usuário sem permissão para fiado 30 dias.");
      }
      // debtDueAt = agora + 30 dias para controle de vencimento no painel Contas a Receber
      const debtDueAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      const updateParcial30 = {
        currentDebt: admin.firestore.FieldValue.increment(total),
        weeklySpent: admin.firestore.FieldValue.increment(total),
        debtDueAt,
      };
      const dividaAntes = Number(fiado30UserData?.currentDebt || 0);
      if (!(dividaAntes > 0)) {
        updateParcial30.debtStartedAt = admin.firestore.Timestamp.now();
      }
      t.update(db.collection("users").doc(fiado30UserId), updateParcial30);
    }

    debitarEstoque(t, itensComPreco);

    let walletBalanceBefore, walletBalanceAfter;
    if (userData && firstUserWalletAmount > 0) {
      walletBalanceBefore = arredondar(Number(userData.walletBalance || 0));
      walletBalanceAfter = arredondar(Number(userData.walletBalance || 0) - firstUserWalletAmount);
    }
    if (firstUserWalletAmount > 0 && userData) {
      t.update(db.collection("users").doc(targetUserId), {
        walletBalance: admin.firestore.FieldValue.increment(-firstUserWalletAmount),
        weeklySpent: admin.firestore.FieldValue.increment(firstUserWalletAmount),
      });
      await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
        userId: targetUserId,
        inmateCpf: cleanCpf(userData.inmateCpf || userData.prisonerCpf || userData.cpf || ""),
        amount: -firstUserWalletAmount,
        proofUrl: "",
        status: "approved",
        createdAt: new Date().toISOString(),
        type: "withdrawal",
        description: hasJointWallet ? `Compra PDV em Dupla (Parte 1: R$ ${firstUserWalletAmount.toFixed(2)})` : "Compra PDV Administrativo",
        payerName: caller.name || "Administrador",
        payerId: caller.id,
      });
    }

    if (hasJointWallet && userData2 && secondUserId && secondWalletAmount > 0) {
      t.update(db.collection("users").doc(secondUserId), {
        walletBalance: admin.firestore.FieldValue.increment(-secondWalletAmount),
        weeklySpent: admin.firestore.FieldValue.increment(secondWalletAmount),
      });
      await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
        userId: secondUserId,
        inmateCpf: cleanCpf(userData2.inmateCpf || userData2.prisonerCpf || userData2.cpf || ""),
        amount: -secondWalletAmount,
        proofUrl: "",
        status: "approved",
        createdAt: new Date().toISOString(),
        type: "withdrawal",
        description: `Compra PDV em Dupla (Parte 2 com ${userData?.name || "1º Devedor"})`,
        payerName: caller.name || "Administrador",
        payerId: caller.id,
      });
    }

    if (cashPortion > 0 && sessaoCaixa) {
      validarTroco(change, cashPortion);
      const payload = {
        currentBalance: admin.firestore.FieldValue.increment(cashPortion),
        supplements: admin.firestore.FieldValue.arrayUnion({
          amount: cashPortion,
          reason: `Venda PDV - ${paymentMethod === "MIXED" ? "Dinheiro (Misto)" : "Dinheiro"}`,
          timestamp: admin.firestore.Timestamp.now(),
        }),
      };
      if (sessaoCaixa.colecao !== "cash_sessions") {
        payload.totalEntries = admin.firestore.FieldValue.increment(cashPortion);
      }
      t.update(refSessaoCaixa(sessaoCaixa), payload);
    }

    const jointWalletSnapshot = hasJointWallet && userData2 ? {
      secondUserId,
      secondUserName: userData2.name || userData2.inmateName || "Devedor 2",
      secondUserCpf: userData2.cpf || userData2.inmateCpf || "000.000.000-00",
      secondWalletAmount,
      firstWalletAmount: firstUserWalletAmount,
    } : null;

    const novoPedido = {
      id: orderId,
      createdAt: new Date().toISOString(),
      status: 'paid',
      userId: targetUserId,
      userName: isConsumer ? "CONSUMIDOR FINAL" : (userData?.name || clienteFiadoNome || "Consumidor"),
      userCpf: isConsumer ? "000.000.000-00" : (userData?.cpf || "000.000.000-00"),
      unitId: isConsumer ? "1" : (userData?.selectedUnitId || userData?.unitId || "1"),
      total,
      items: itensComPreco,
      paymentMethod,
      ...(paymentMethod === "CARD" && cardBrand ? { cardBrand: cardBrand.toUpperCase() } : {}),
      ...(paymentMethod === "MIXED" ? { payments } : {}),
      ...(change !== undefined && (paymentMethod === "MIXED" || paymentMethod === "CASH") ? { change } : {}),
      inmateName: isConsumer ? "CONSUMIDOR FINAL" : (userData?.inmateName || userData?.prisonerName || "NÃO INFORMADO"),
      inmateCpf: isConsumer ? "000.000.000-00" : (userData?.inmateCpf || userData?.prisonerCpf || "000.000.000-00"),
      operatorName: caller.name || "ADMIN",
      operatorId: caller.id,
      ...pixConfirmacao,
      ...(walletBalanceBefore !== undefined ? { walletBalanceBefore } : {}),
      ...(walletBalanceAfter !== undefined ? { walletBalanceAfter } : {}),
      ...(jointWalletSnapshot ? { jointWallet: jointWalletSnapshot } : {}),
      ...((paymentMethod === "FIADO" || paymentMethod === "FIADO_30") && customerAccountId ? { customerAccountId } : {}),
    };

    t.set(db.collection("orders").doc(orderId), novoPedido);
    // Idempotência: grava a marca do token apontando para o pedido criado.
    marcarIdempotenciaVenda(t, lerClientToken(request.data), caller.id, orderId);
    return novoPedido;
  });
  } catch (e) {
    // NUNCA engolir o erro real: loga para auditoria/diagnóstico e devolve ao
    // operador a MENSAGEM REAL (já escrita em PT-BR amigável) — ex.: "Estoque
    // insuficiente", "A sessão de caixa foi fechada", "A soma dos pagamentos
    // não confere". O genérico "tente novamente" escondia saldo/estoque/sessão
    // e o operador não tinha como corrigir o problema.
    console.error("[processarVendaAdmin] Falha ao processar venda", {
      paymentMethod,
      targetUserId,
      totalRequisitado: request.data?.total,
      erro: e && e.message ? e.message : e,
      stack: e && e.stack ? e.stack : undefined,
    });
    if (e && e.code && String(e.code).startsWith("functions/")) throw e;
    const msg = (e && e.message) || "Falha ao processar a venda. Tente novamente.";
    // Whitelist de erros de negócio já amigáveis (escritos em PT-BR no backend).
    if (/produto não encontrado|estoque insuficiente|saldo insuficiente|limite semanal|consumidor final não pode|2º devedor|não confere com o total|nenhuma sessão de caixa|caixa antes|cai?a foi fechada|reabra o caixa|cliente bloqueado|cliente de fiado (não )?encontrado|exige cliente cadastrado|pagamento misto sem valores|método inválido|valor inválido|fiado e card não são suportados|carteira|duplicada|troco|senha|fiado 30|entrada de mercadoria/i.test(msg)) {
      throw new HttpsError("invalid-argument", msg);
    }
    throw new HttpsError("internal", "Falha ao processar a venda. Tente novamente.");
  }

  if (!resultado.replay) {
    await registrarAudit(caller.id, "VENDA_PDV_ADMIN", { pedidoId: resultado.id, usuarioId: targetUserId }, {
      pedidoId: resultado.id,
      usuarioId: targetUserId,
      valor: resultado.total,
      formaPagamento: paymentMethod,
      operadorId: caller.id,
    });
  }

  return { ok: true, order: resultado };
});

/**
 * Autenticado (usuário) — compra com a carteira no app do usuário.
 * Preços e saldo calculados no servidor.
 */
exports.comprarComCarteira = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  const itens = validarItens(request.data?.items);
  const inmateLocation = request.data?.inmateLocation || null;
  const deliveryLocation = request.data?.deliveryLocation || inmateLocation || null;

  // ID do pedido derivado do clientToken quando presente (reenvios reutilizam o
  // mesmo ID; sem token segue com ID aleatório por compatibilidade antiga).
  const clientToken = lerClientToken(request.data);
  const orderId = clientToken
    ? clientToken.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase()
    : Math.random().toString(36).slice(2, 14).toUpperCase();
  let resultado;
  try {
    resultado = await db.runTransaction(async (t) => {
      const guarda = await verificarIdempotenciaVenda(t, clientToken, user.id);
      if (guarda) return { ...guarda.order, replay: true };
      const { resultado: itensComPreco, total } = await prepararItensServidor(t, itens);

      const uSnap = await t.get(db.collection("users").doc(user.id));
    if (!uSnap.exists) throw new Error("Usuário não encontrado.");
    const ud = uSnap.data();
    if (Number(ud.walletBalance || 0) < total) throw new Error(`Crédito insuficiente! Disponível: R$ ${Number(ud.walletBalance || 0).toFixed(2)}`);

    // Limite semanal de compras com carteira (validado NO SERVIDOR, sempre ativo)
    if (!ud.autorizacaoExcepcional) {
      const cfgSnap = await t.get(db.collection("settings").doc("general"));
      const cfg = cfgSnap.exists ? cfgSnap.data() : {};
      verificarLimiteSemanal(ud.weeklySpent || 0, total, cfg.weeklyWalletLimit);
    }

    debitarEstoque(t, itensComPreco);

    // ATÔMICO: evita race condition entre compras simultâneas (wallet + weeklySpent)
    t.update(db.collection("users").doc(user.id), {
      walletBalance: admin.firestore.FieldValue.increment(-arredondar(total)),
      weeklySpent: admin.firestore.FieldValue.increment(arredondar(total))
    });
    const novoSaldo = calcularNovoSaldo(ud.walletBalance || 0, total);
    const novoWeekly = arredondar(Number(ud.weeklySpent || 0) + total);
    const saldoAnterior = arredondar(Number(ud.walletBalance || 0));

    await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
      userId: user.id,
      inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ud.cpf || ""),
      amount: -total,
      proofUrl: "",
      status: "approved",
      createdAt: new Date().toISOString(),
      type: "withdrawal",
      description: "Compra no aplicativo",
      payerName: user.name || "",
      payerId: user.id,
    });

    const novoPedido = {
      id: orderId,
      userId: user.id,
      userName: user.name || "",
      userCpf: ud.cpf || "",
      unitId: ud.selectedUnitId || "1",
      unitName: "Unidade Prisional",
      status: "paid",
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      items: itensComPreco,
      total,
      paymentMethod: "WALLET",
inmateName: ud.inmateName || ud.prisonerName || "",
      inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ""),
      walletBalanceBefore: saldoAnterior,
      walletBalanceAfter: novoSaldo,
      operatorName: user.name || "USUÁRIO",
      ...(inmateLocation ? { inmateLocation } : {}),
      ...(deliveryLocation ? { deliveryLocation } : {}),
    };

    t.set(db.collection("orders").doc(orderId), novoPedido);
    // Idempotência: grava a marca do token apontando para o pedido criado.
    marcarIdempotenciaVenda(t, clientToken, user.id, orderId);
    return novoPedido;
  });
  } catch (e) {
    throw new HttpsError("invalid-argument", "Falha ao processar a compra. Tente novamente.");
  }

  if (!resultado.replay) {
    await registrarAudit(user.id, "COMPRA_CARTEIRA", { pedidoId: resultado.id }, {
      pedidoId: resultado.id,
      valor: resultado.total,
      itens: (resultado.items || []).length,
    });
  }

  return { ok: true, order: resultado };
});

/**
 * Autenticado (usuário) — pedido PIX com comprovante de pagamento.
 * Preços calculados no servidor e estoque debitado atomicamente;
 * o pedido nasce como PENDENTE até o admin confirmar o comprovante.
 */
exports.registrarPedidoPix = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  // Rate limit: máx 5 pedidos PIX por minuto por usuário (evita spam de pedidos pendentes que travam estoque)
  verificarRateLimit("registrarPedidoPix:" + user.id, 5, 60 * 1000);
  const itens = validarItens(request.data?.items);
  const paymentProofUrl = String(request.data?.paymentProofUrl || "").trim().slice(0, 500000);
  const inmateLocation = request.data?.inmateLocation || null;
  const deliveryLocation = request.data?.deliveryLocation || inmateLocation || null;
  // Metadados anti-fraude: hash do arquivo, tamanho, tipo (enviados pelo app).
  // O hash é a identidade do comprovante — MESMO arquivo = MESMO hash.
  const proofHash = String(request.data?.proofHash || "").trim().slice(0, 128);
  const proofSize = Number(request.data?.proofSize || 0) || 0;
  const proofMime = String(request.data?.proofMime || "").trim().slice(0, 100);

  if (!paymentProofUrl) {
    throw new HttpsError("invalid-argument", "Envie o comprovante do PIX antes de confirmar o pedido.");
  }
  // Comprovante pendente (upload offline, será reenviado pelo app) ou URL do Storage.
  // A URL precisa pertencer ao bucket do projeto E à pasta do próprio usuário
  // (comprovante de outro usuário/projeto não pode ser usado para confirmar um pedido).
  if (paymentProofUrl !== "PENDENTE_UPLOAD_LOCAL_CACHE" && !(await comprovanteEhDoUsuario(paymentProofUrl, user, "comprovantes_pix"))) {
    throw new HttpsError("invalid-argument", "Comprovante inválido. Envie a imagem do comprovante pelo aplicativo.");
  }
  // Verificação REAL do arquivo no Storage: confirma que existe, tem tamanho
  // mínimo de recibo real e tipo permitido. Fecha a brecha de URLs falsas.
  if (paymentProofUrl !== "PENDENTE_UPLOAD_LOCAL_CACHE") {
    const objCheck = await verificarObjetoComprovante(paymentProofUrl, "comprovantes_pix");
    if (!objCheck.ok) {
      throw new HttpsError("invalid-argument", `Comprovante inválido: ${objCheck.motivo}`);
    }
  }

  // DUPLICIDADE DE COMPROVANTE: impede que a MESMA imagem seja usada
  // em dois pedidos diferentes (reuso de print de tela, WhatsApp, etc.).
  // Exclui o próprio pedido (replay) e pedidos cancelados/estornados.
  // FAIL-CLOSED: se a query composta falhar (índice ausente), tenta
  // fallback sem filtro de status; se falhar de novo, rejeita o pedido.
  if (paymentProofUrl !== "PENDENTE_UPLOAD_LOCAL_CACHE") {
    try {
      const provasUsadas = await db.collection("orders")
        .where("paymentProofUrl", "==", paymentProofUrl)
        .where("status", "not-in", ["cancelled", "cancelado", "refunded", "devolvido", "reembolsado", "rejected", "rejeitado"])
        .limit(1)
        .get();
      if (!provasUsadas.empty) {
        const jaUsado = provasUsadas.docs[0].data();
        throw new HttpsError("already-exists", `Este comprovante já foi usado no pedido #${jaUsado.id} (${jaUsado.status}). Cada comprovante só pode confirmar uma compra.`);
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      // Índice composto ausente — fallback: busca sem filtro de status
      // (aceita falso-positivo de pedidos cancelados como seguro)
      logger.warn("Query composta falhou, usando fallback sem filtro de status:", e.message);
      try {
        const provasUsadas = await db.collection("orders")
          .where("paymentProofUrl", "==", paymentProofUrl)
          .limit(5)
          .get();
        if (!provasUsadas.empty) {
          const ativos = provasUsadas.docs.filter(d => {
            const s = String(d.data().status || "").toLowerCase();
            return s !== "cancelled" && s !== "cancelado" && s !== "refunded" && s !== "devolvido" && s !== "reembolsado" && s !== "rejected" && s !== "rejeitado";
          });
          if (ativos.length > 0) {
            const jaUsado = ativos[0].data();
            throw new HttpsError("already-exists", `Este comprovante já foi usado no pedido #${ativos[0].id} (${jaUsado.status}). Cada comprovante só pode confirmar uma compra.`);
          }
        }
      } catch (e2) {
        if (e2 instanceof HttpsError) throw e2;
        // Falha total na verificação — rejeita por segurança
        throw new HttpsError("unavailable", "Não foi possível verificar duplicidade do comprovante. Tente novamente em instantes.");
      }
    }
  }

 const orderId = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase() : Math.random().toString(36).slice(2, 14)).toUpperCase();
  const clientToken = lerClientToken(request.data);
  let resultado;
  try {
    resultado = await db.runTransaction(async (t) => {
      const guarda = await verificarIdempotenciaVenda(t, clientToken, user.id);
      if (guarda) return { ...guarda.order, replay: true };
      // ANTI-FRAUDE POR HASH: mesmo arquivo reutilizado = mesmo hash.
      // Roda DEPOIS do guard de idempotência — replay retorna antes, sem falso-rejeito.
      if (proofHash) {
        try {
          const hashSnap = await t.get(db.collection("orders").where("proofHash", "==", proofHash).limit(8));
          const ATIVOS = ["cancelled","cancelado","refunded","devolvido","reembolsado","rejected","rejeitado"];
          const duplicatas = hashSnap.docs.filter((d) => {
            const s = String(d.data().status || "").toLowerCase();
            return !ATIVOS.includes(s);
          });
          if (duplicatas.length > 0) {
            const jaUsado = duplicatas[0].data();
            throw new HttpsError("already-exists", `Este comprovante já foi utilizado no pedido #${duplicatas[0].id} (${jaUsado.status || "?"}). Cada comprovante só pode confirmar uma compra.`);
          }
        } catch (e) {
          if (e instanceof HttpsError) throw e;
          // Se a query falhar (índice), mantém o fluxo — a dedup por URL
          // ainda atua como proteção secundária.
        }
      }
      const { resultado: itensComPreco, total } = await prepararItensServidor(t, itens);
      const uSnap = await t.get(db.collection("users").doc(user.id));
      const ud = uSnap.exists ? uSnap.data() : {};
      debitarEstoque(t, itensComPreco);

    const novoPedido = {
      id: orderId,
      userId: user.id,
      userName: user.name || "",
      userCpf: ud.cpf || "",
      unitId: ud.selectedUnitId || "1",
      unitName: "Unidade Prisional",
      status: "pending",
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      items: itensComPreco,
      total,
paymentMethod: "PIX",
      paymentProofUrl,
      ...(proofHash ? { proofHash, proofSize, proofMime } : {}),
      walletBalanceBefore: arredondar(Number(ud.walletBalance || 0)),
      walletBalanceAfter: arredondar(Number(ud.walletBalance || 0)),
      inmateName: ud.inmateName || ud.prisonerName || "",
      inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ""),
      ...(inmateLocation ? { inmateLocation } : {}),
      ...(deliveryLocation ? { deliveryLocation } : {}),
    };

    t.set(db.collection("orders").doc(orderId), novoPedido);
    // Idempotência: grava a marca do token apontando para o pedido criado.
    marcarIdempotenciaVenda(t, clientToken, user.id, orderId);
    return novoPedido;
  });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("invalid-argument", "Falha ao registrar o pedido. Tente novamente.");
  }

  if (!resultado.replay) {
    await registrarAudit(user.id, "PEDIDO_PIX", { pedidoId: resultado.id }, {
      pedidoId: resultado.id,
      valor: resultado.total,
      itens: (resultado.items || []).length,
    });
  }

  return { ok: true, order: resultado };
});

/** Admin ─ aprova pedido PIX de forma atômica e auditada.
 *  - Valida que o pedido ainda está pendente e possui comprovante anexado
 *    (mesma proteção do aprovarDeposito — nunca aprova sem evidência).
 *  - Revalida o comprovante no Storage (existência, tamanho, tipo, dono).
 *  - Verifica deduplicação por hash (mesmo comprovante não pode aprovar 2 pedidos).
 *  - Com finalizar=true, aprova E finaliza a compra em um único passo.
 *  - Registra auditoria e notifica o usuário que fez o pedido.
 */
exports.aprovarPedidoPix = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "orders");
  const orderId = String(request.data?.orderId || "").trim();
  const finalizar = request.data?.finalizar === true;
  if (!orderId) throw new HttpsError("invalid-argument", "Pedido inválido.");

  // 1) Carrega o pedido fora da transação para validações de comprovante
  const oSnap = await db.collection("orders").doc(orderId).get();
  if (!oSnap.exists) throw new HttpsError("not-found", "Pedido não encontrado.");
  const pedido = oSnap.data();
  const st = String(pedido.status || "").toLowerCase();
  if (!["pending", "pendente", "pago_pendente", "pending_payment"].includes(st)) {
    throw new HttpsError("failed-precondition", "Este pedido já foi processado (status atual: " + pedido.status + ").");
  }
  const ehCarteira = String(pedido.paymentMethod || "").toUpperCase() === "WALLET";

  // 2) Para PIX (não carteira): validação flexível (arquivo real + dedup hash/URL + avisa se pasta ≠ usuário)
  if (!ehCarteira) {
    const proof = String(pedido.paymentProofUrl || "").trim();
    if (!proof || proof === "PENDENTE_UPLOAD_LOCAL_CACHE") {
      throw new HttpsError("failed-precondition", "Pedido sem comprovante de pagamento. Anexe o comprovante antes de aprovar.");
    }
    const validacao = await validarComprovanteFlexivel(
      proof,
      pedido.userId,
      "comprovantes_pix",
      pedido.proofHash,
      pedido.proofSize,
      pedido.proofMime,
      orderId // docIdAtual: ignora o PRÓPRIO pedido na dedup
    );
    if (!validacao.ok) throw new HttpsError("failed-precondition", validacao.motivo);
    if (validacao.warning) logger.warn(`[aprovarPedidoPix] ${validacao.warning} orderId=${orderId}`);
  }

  // 3) Transação atômica: atualiza status do pedido
  let statusFinal = "";
  let usuarioId = "";
  try {
    statusFinal = await db.runTransaction(async (t) => {
      const oRef = db.collection("orders").doc(orderId);
      const freshSnap = await t.get(oRef);
      if (!freshSnap.exists) throw new Error("Pedido não encontrado.");
      const fresh = freshSnap.data();
      const st2 = String(fresh.status || "").toLowerCase();
      if (!["pending", "pendente", "pago_pendente", "pending_payment"].includes(st2)) {
        throw new Error("Este pedido já foi processado (status atual: " + fresh.status + ").");
      }
      const agora = new Date().toISOString();
      const atualizacao = {
        status: finalizar ? "delivered" : "paid",
        approvedBy: caller.name || caller.id,
        approvedAt: agora,
        paidAt: agora,
      };
      if (finalizar) {
        atualizacao.deliveredAt = agora;
      }
      t.update(oRef, atualizacao);
      usuarioId = String(fresh.userId || "");
      return atualizacao.status;
    });
  } catch (e) {
    throw new HttpsError("invalid-argument", "Falha ao aprovar o pedido. Tente novamente.");
  }

  await registrarAudit(
    caller.id,
    finalizar ? "APROVAR_E_FINALIZAR_PEDIDO" : "APROVAR_PEDIDO",
    { orderId },
    { status: statusFinal, por: caller.name || caller.id }
  ).catch(() => {});

  if (usuarioId) {
    try {
      await db.collection("systemMessages").add({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        type: finalizar ? "success" : "info",
        title: `Pedido #${orderId.slice(0, 6)} ${finalizar ? "FINALIZADO" : "PAGO"}`,
        content: finalizar
          ? "Seu pedido foi aprovado e finalizado com sucesso. Você receberá suas compras em breve."
          : "Seu pagamento foi aprovado. Seu pedido já está sendo preparado.",
        targetUserId: usuarioId,
      });
    } catch (eNotif) {
      logger.warn("[AprovarPedido] Falha ao notificar usuário:", eNotif.message);
    }
  }

  return { ok: true, status: statusFinal };
});

// ──────────────────────────────────────────────
// BUSCA DE PEDIDOS PARA ESTORNO (PDV + Ordens)
// ──────────────────────────────────────────────
// Busca server-side por pedidos estornáveis. Não depende de ÍNDICE
// COMPOSTO (lição do erro "internal"): usa apenas orderBy('createdAt')
// por janela — índice de campo único, disponível automaticamente — e
// aplica o filtro de termo/status em MEMÓRIA. Paginação por
// startAfter(createdAt) do último resultado (createdAt é ISO string,
// ordenação lexicográfica == cronológica).
exports.buscarPedidosParaEstorno = onCall(async (request) => {
  await exigirAdminPermissao(request, "sales");
  const term = String(request.data?.term || "").trim().toLowerCase();
  const termCpf = term.replace(/\D/g, "");
  const startAfter = String(request.data?.startAfter || "");
  const WINDOW = 400;
  const LIMITE_RESULTADOS = 20;

  const EXCLUIR = new Set([
    "CANCELLED", "CANCELADO", "CANCELED",
    "REFUNDED", "RETURNED",
    "DEVOLVIDO", "ESTORNADO", "REEMBOLSADO",
    "REJECTED", "REJEITADO",
  ]);
  const ativo = (o) => {
    const st = String(o.status || "").toUpperCase();
    return !o.deleted && !EXCLUIR.has(st);
  };
  const combina = (o) => {
    if (!term) return true;
    if (String(o.id || "").toLowerCase().includes(term)) return true;
    if (String(o.userName || "").toLowerCase().includes(term)) return true;
    if (String(o.inmateName || "").toLowerCase().includes(term)) return true;
    if (termCpf && String(o.userCpf || "").replace(/\D/g, "").includes(termCpf)) return true;
    return false;
  };

  try {
    let q = db.collection("orders").orderBy("createdAt", "desc").limit(WINDOW);
    if (startAfter) q = q.startAfter(startAfter);
    const snap = await q.get();

    const resultados = [];
    for (const doc of snap.docs) {
      const d = doc.data();
      if (!ativo(d) || !combina(d)) continue;
      resultados.push({
        id: doc.id,
        total: d.total || 0,
        paymentMethod: d.paymentMethod || "",
        userName: d.userName || d.inmateName || "CONSUMIDOR GERAL",
        inmateName: d.inmateName || "",
        userCpf: d.userCpf || "",
        date: d.date || d.createdAt || "",
        createdAt: d.createdAt || "",
        status: d.status || "pending",
        items: (Array.isArray(d.items) ? d.items : []).map((i) => ({
          name: i.name || "",
          quantity: i.quantity || 0,
          priceAtPurchase: i.priceAtPurchase || 0,
        })),
      });
      if (resultados.length >= LIMITE_RESULTADOS) break;
    }

    return {
      ok: true,
      results: resultados,
      hasMore: resultados.length >= LIMITE_RESULTADOS,
      last: resultados.length > 0 ? (resultados[resultados.length - 1].createdAt || "") : "",
    };
  } catch (e) {
    logger.warn("[BuscarPedidosEstorno] Falha:", e.message);
    throw new HttpsError("unavailable", "Falha ao buscar pedidos para estorno. Tente novamente.");
  }
});

/** Admin — estorno/devolução de pedido com carteira. */
exports.estornarVenda = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "sales");
  const orderId = String(request.data?.orderId || "");
  const motivo = String(request.data?.motivo || "Devolução administrativa").slice(0, 200);
  if (!orderId) throw new HttpsError("invalid-argument", "Pedido inválido.");

  try {
    // Resolve a sessão de caixa ANTES da transação (queries não são permitidas dentro dela)
    const preSnap = await db.collection("orders").doc(orderId).get();
    let caixaAlvo = null;
    if (preSnap.exists) {
      const pre = preSnap.data();
      const ehCashPre = pre.paymentMethod === "CASH" ||
        (Array.isArray(pre.payments) && pre.payments.some((p) => p.method === "CASH"));
      if (ehCashPre && pre.date) {
        caixaAlvo = await resolverSessaoCaixaDoPedido(pre);
      }
    }

    await db.runTransaction(async (t) => {
      const oRef = db.collection("orders").doc(orderId);
      const oSnap = await t.get(oRef);
      if (!oSnap.exists) throw new Error("Pedido não encontrado.");
      const pedido = oSnap.data();
      const statusAtual = String(pedido.status || "").toUpperCase();
      if (pedido.deleted) {
        throw new Error("Este pedido foi excluído (lixeira). O estoque já foi devolvido; restaure o pedido antes de estornar.");
      }
      // Bloqueia TODOS os aliases de cancelado/devolvido/estornado (PT/EN)
      // Impede double-refund se admin fez updateOrderStatus direto com termo variante.
      const STATUS_ESTORNADO = [
        "CANCELLED", "CANCELADO", "CANCELED",
        "REFUNDED", "RETURNED",
        "DEVOLVIDO", "ESTORNADO", "REEMBOLSADO",
        "REJECTED", "REJEITADO"
      ];
      if (STATUS_ESTORNADO.includes(statusAtual)) {
        throw new Error("Este pedido já foi cancelado/devolvido/estornado.");
      }

      const itens = Array.isArray(pedido.items) ? pedido.items : [];
      const snaps = await Promise.all(itens.map((i) => t.get(db.collection("products").doc(i.productId))));

      const ehWallet = pedido.paymentMethod === "WALLET" ||
        (Array.isArray(pedido.payments) && pedido.payments.some((p) => p.method === "WALLET"));
      const ehCash = pedido.paymentMethod === "CASH" ||
        (Array.isArray(pedido.payments) && pedido.payments.some((p) => p.method === "CASH"));

      const uRef = ehWallet && pedido.userId && pedido.userId !== "balcao_anonimo"
        ? db.collection("users").doc(pedido.userId)
        : null;
      const uSnap = uRef ? await t.get(uRef) : null;
      const caixaRef = caixaAlvo ? caixaAlvo.ref : null;
      const caixaSnap = caixaRef ? await t.get(caixaRef) : null;
      const ehFiado = pedido.paymentMethod === "FIADO" || pedido.paymentMethod === "FIADO_30";
      // UNIFICADO: a dívida fiada mora no doc do USUÁRIO (users/<customerAccountId>),
      // então o estorno reverte lá — nada de chunk paralelo customer_accounts.
      const caRef = ehFiado && pedido.customerAccountId
        ? db.collection("users").doc(pedido.customerAccountId)
        : null;
      const caSnap = caRef ? await t.get(caRef) : null;

      itens.forEach((item, idx) => {
        if (snaps[idx].exists) {
          const freshStock = snaps[idx].data().stock || 0;
          t.update(snaps[idx].ref, { stock: freshStock + (Number(item.quantity) || 0) });
        }
      });

      // ── Carteira: estorno pela função PURA (cada devedor recebe a PRÓPRIA parcela) ──
      const estorno = calcularEstornoCarteira(pedido);

      if (estorno.ehWallet && uRef && uSnap && uSnap.exists) {
        const ud = uSnap.data();

        // ATÔMICO: estorno lê o weeklySpent atual, calcula o novo valor clampado em 0,
        // e escreve explicitamente — evita weeklySpent NEGATIVO (bug do increment(-)).
        const parcela1 = arredondar(estorno.primeiraParcela);
        const novoSaldo = arredondar(Number(ud.walletBalance || 0) + parcela1);
        const novoWeekly = Math.max(0, arredondar((Number(ud.weeklySpent || 0) - parcela1)));
        t.update(uRef, {
          walletBalance: admin.firestore.FieldValue.increment(parcela1),
          weeklySpent: novoWeekly
        });
        registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
          userId: pedido.userId,
          inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ud.cpf || ""),
          amount: parcela1,
          proofUrl: "",
          status: "approved",
          createdAt: new Date().toISOString(),
          type: "correction",
          description: estorno.segundaParcela > 0
            ? `Estorno Pedido #${String(orderId).slice(0, 6)} (Parte 1 - Devedor 1): ${motivo}`
            : `Estorno Pedido #${String(orderId).slice(0, 6)}: ${motivo}`,
          payerName: caller.name || "Administrador",
          payerId: caller.id,
        });
      }

      // Devolve a parcela do DEVEDOR 2 na carteira dele (mesma transação;
      // independe do cadastro do Devedor 1 existir)
      if (estorno.ehWallet && estorno.segundaParcela > 0 && estorno.secondUserId && String(estorno.secondUserId) !== String(pedido.userId)) {
        const jwRef = db.collection("users").doc(estorno.secondUserId);
        const jwSnap = await t.get(jwRef);
        if (jwSnap.exists) {
          const ud2 = jwSnap.data();

          // ATÔMICO: mesma proteção clamp em 0 para weeklySpent do devedor 2
          const parcela2 = arredondar(estorno.segundaParcela);
          const novoWeekly2 = Math.max(0, arredondar((Number(ud2.weeklySpent || 0) - parcela2)));
          t.update(jwRef, {
            walletBalance: admin.firestore.FieldValue.increment(parcela2),
            weeklySpent: novoWeekly2
          });
          registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
            userId: estorno.secondUserId,
            inmateCpf: cleanCpf(ud2.inmateCpf || ud2.prisonerCpf || ud2.cpf || pedido.jointWallet.secondUserCpf || ""),
            amount: parcela2,
            proofUrl: "",
            status: "approved",
            createdAt: new Date().toISOString(),
            type: "correction",
            description: `Estorno Pedido #${String(orderId).slice(0, 6)} (Parte 2 - Devedor 2): ${motivo}`,
            payerName: caller.name || "Administrador",
            payerId: caller.id,
          });
        }
      }

      // FIADO: reverte a dívida gravada no servidor (vendas novas); as antigas sem customerAccountId são ignoradas
      if (caRef && caSnap && caSnap.exists) {
        const conta = caSnap.data();
        const valorTotal = Number(pedido.total) || 0;
        const novoDebt = Math.max(0, arredondar((Number(conta.currentDebt) || 0) - valorTotal));
        const updateReversao = {
          currentDebt: novoDebt,
          weeklySpent: Math.max(0, arredondar((Number(conta.weeklySpent) || 0) - valorTotal)),
          transactions: admin.firestore.FieldValue.arrayUnion({
            type: "reversal",
            amount: valorTotal,
            orderId,
            timestamp: admin.firestore.Timestamp.now(),
          }),
        };
        // Dívida zerada: limpa marcos de vencimento (base para "Contas a Receber").
        if (novoDebt <= 0) {
          updateReversao.debtStartedAt = admin.firestore.FieldValue.delete();
          updateReversao.debtDueAt = admin.firestore.FieldValue.delete();
        }
        t.update(caRef, updateReversao);
      }

      if (caixaRef && caixaSnap && caixaSnap.exists) {
        const parteCash = pedido.paymentMethod === "CASH"
          ? (Number(pedido.total) || 0)
          : (pedido.payments || []).filter((p) => p.method === "CASH").reduce((s, p) => s + (Number(p.amount) || 0), 0);
        if (parteCash > 0) {
          const payloadEstorno = {
            currentBalance: admin.firestore.FieldValue.increment(-parteCash),
            supplements: admin.firestore.FieldValue.arrayUnion({
              amount: -parteCash,
              reason: `Estorno Pedido #${String(orderId).slice(0, 6)}: ${motivo}`,
              timestamp: admin.firestore.Timestamp.now(),
            }),
          };
          if (caixaAlvo.colecao !== "cash_sessions") {
            payloadEstorno.totalEntries = admin.firestore.FieldValue.increment(-parteCash);
          }
          t.update(caixaRef, payloadEstorno);
        }
      }

      t.update(oRef, { status: "cancelled", refundReason: motivo });
    });
  } catch (e) {
    throw new HttpsError("invalid-argument", "Falha ao estornar o pedido. Tente novamente.");
  }

  await registrarAudit(caller.id, "ESTORNAR_VENDA", { pedidoId: orderId }, { pedidoId: orderId, motivo });

return { ok: true };
});

// ──────────────────────────────────────────────
// PAGAMENTO DE CONTA FIADA ("Contas a Pagar")
// ──────────────────────────────────────────────
// Antes o abatimento era 100% client-side sem validação (a dívida podia ficar
// negativa e o pagamento poderia superar o débito). Agora é atômico no servidor:
//  - valida que o valor é positivo e NÃO supera a dívida atual;
//  - abate com clamp (nunca fica negativa);
//  - registra a transação na conta;
//  - credita o valor na sessão de caixa do operador (quando aberta);
//  - autorização: qualquer operador admin (como antes, direto do cliente).
exports.registrarPagamentoConta = onCall({
  timeoutSeconds: 60,
}, async (request) => {
  const caller = await exigirAdminPermissao(request, "finance");
  const customerAccountId = String(request.data?.customerAccountId || "").trim();
  const amount = arredondar(Number(request.data?.amount) || 0);
  const note = String(request.data?.note || "").trim().slice(0, 120);

  if (!customerAccountId) throw new HttpsError("invalid-argument", "Cliente de fiado não informado.");
  if (!(amount > 0)) throw new HttpsError("invalid-argument", "Valor do pagamento deve ser maior que zero.");

      // UNIFICADO: a "conta de fiado" É o usuário cadastrado (users/<customerAccountId>),
  // mesmo universo das demais formas. Dívida/limite/gasto ficam no doc do usuário.
  const clienteRef = db.collection("users").doc(customerAccountId);

  // Sessão de caixa do operador resolvida ANTES da transação (revalidada dentro),
  // mesmo padrão das vendas em dinheiro — cobre cash_sessions E cashier legado.
  let sessaoCaixaPgt = null;
  try { sessaoCaixaPgt = await getSessaoCaixaAberta(caller.id); } catch (e) { /* caixa opcional */ }

  let resultado;
  try {
    resultado = await db.runTransaction(async (t) => {
      const contaSnap = await t.get(clienteRef);
      if (!contaSnap.exists) throw new Error("Conta de fiado não encontrada.");
      const conta = contaSnap.data();
      const dividaAtual = arredondar(Number(conta.currentDebt || 0));
      if (dividaAtual <= 0) throw new Error("Este cliente não possui débito em aberto.");

      const excedente = arredondar(amount - dividaAtual);
      if (excedente > 0) {
        throw new Error(`O pagamento (R$ ${amount.toFixed(2)}) supera a dívida (R$ ${dividaAtual.toFixed(2)}). Abata no máximo o valor devido.`);
      }

      const novoDebito = arredondar(dividaAtual - amount);

      const updateConta = {
        currentDebt: novoDebito,
        transactions: admin.firestore.FieldValue.arrayUnion({
          type: "payment",
          amount,
          note,
          timestamp: admin.firestore.Timestamp.now(),
          by: caller.id,
          byName: caller.name || "Administrador",
        }),
      };
      // Dívida zerada: limpa marcos de vencimento (base para "Contas a Receber").
      if (novoDebito <= 0) {
        updateConta.debtStartedAt = admin.firestore.FieldValue.delete();
        updateConta.debtDueAt = admin.firestore.FieldValue.delete();
      }
      t.update(clienteRef, updateConta);

      // Credita na sessão de caixa aberta do operador (se houver)
      if (sessaoCaixaPgt) {
        const sessaoSnap = await t.get(refSessaoCaixa(sessaoCaixaPgt));
        if (sessaoSnap.exists && String(sessaoSnap.data().status || "").toUpperCase() === "OPEN") {
          const payloadPgt = {
            currentBalance: admin.firestore.FieldValue.increment(amount),
            supplements: admin.firestore.FieldValue.arrayUnion({
              amount,
              reason: `Recebimento de Fiado - ${conta.nome || customerAccountId}`,
              timestamp: admin.firestore.Timestamp.now(),
            }),
          };
          if (sessaoCaixaPgt.colecao !== "cash_sessions") {
            payloadPgt.totalEntries = admin.firestore.FieldValue.increment(amount);
          }
          t.update(sessaoSnap.ref, payloadPgt);
        }
      }

      return { dividaAnterior: dividaAtual, novoDebito };
    });
  } catch (e) {
    throw new HttpsError("invalid-argument", "Falha ao registrar o pagamento. Tente novamente.");
  }

  await registrarAudit(caller.id, "PAGAR_CONTA_FIADO", { clienteId: customerAccountId, amount }, resultado);

  return { ok: true, ...resultado };
});

/**
 * Admin — abate dívida fiada de um usuário cadastrado (universo UNIFICADO).
 * Diferente do registrarPagamentoConta, NÃO credita dinheiro em caixa: apenas
 * reduz o débito (ajuste/abono/conciliação). Atômico, clamp ≥ 0 e limpa os
 * marcos de vencimento quando a dívida zera.
 */
exports.abaterDividaFiado = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "finance");
  const userId = String(request.data?.userId || "").trim();
  const amount = arredondar(Number(request.data?.amount) || 0);
  const note = String(request.data?.note || "").trim().slice(0, 120);

  if (!userId) throw new HttpsError("invalid-argument", "Usuário não informado.");
  if (!(amount > 0)) throw new HttpsError("invalid-argument", "Valor do abatimento deve ser maior que zero.");

  verificarRateLimit("abaterDividaFiado:" + caller.id, 30);

  const userRef = db.collection("users").doc(userId);
  let resultado;
  try {
    resultado = await db.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists) throw new Error("Usuário não encontrado.");
      const dados = snap.data();
      const dividaAtual = arredondar(Number(dados.currentDebt || 0));
      if (dividaAtual <= 0) throw new Error("Este usuário não possui dívida em aberto.");

      const aAbater = arredondar(Math.min(amount, dividaAtual));
      if (aAbater <= 0) throw new Error("Valor de abatimento inválido.");

      const novoDebito = arredondar(dividaAtual - aAbater);
      const update = {
        currentDebt: novoDebito,
        transactions: admin.firestore.FieldValue.arrayUnion({
          type: "adjustment",
          amount: -aAbater,
          note,
          timestamp: admin.firestore.Timestamp.now(),
          by: caller.id,
          byName: caller.name || "Administrador",
        }),
      };
      if (novoDebito <= 0) {
        update.debtStartedAt = admin.firestore.FieldValue.delete();
        update.debtDueAt = admin.firestore.FieldValue.delete();
      }
      t.update(userRef, update);
      return { dividaAnterior: dividaAtual, novoDebito, abatido: aAbater };
    });
  } catch (e) {
    if (e && e.code && String(e.code).startsWith("functions/")) throw e;
    throw new HttpsError("invalid-argument", (e && e.message) || "Falha ao abater a dívida. Tente novamente.");
  }

  await registrarAudit(caller.id, "ABATER_DIVIDA_FIADO", { userId, amount, note }, resultado);

  return { ok: true, ...resultado };
});

/**
 * Admin — cria um cliente de fiado no universo UNIFICADO (fiado = usuário).
 * Grava users/<id> com allowCredit, SEM criar credenciais de login (o cliente
 * pode ser vinculado depois pelo fluxo "provisionar" do registrarUsuario).
 * Criação 100% SERVER-SIDE (admin SDK ignora as rules — o allow create: if
 * false permanece nas rules como proteção contra criação arbitrária do cliente).
 */
exports.criarClienteFiado = onCall(async (request) => {
  const caller = await exigirAdminPermissao(request, "users");
  const nome = String(request.data?.nome || "").trim();
  const cpf = cleanCpf(request.data?.cpf);
  const telefone = String(request.data?.telefone || "").trim().slice(0, 20);
  const creditLimit = arredondar(Number(request.data?.creditLimit) || 0);

  verificarRateLimit("criarClienteFiado:" + caller.id, 20);

  if (nome.length < 3) throw new HttpsError("invalid-argument", "Informe o nome completo do cliente.");
  if (cpf && cpf.length !== 11) throw new HttpsError("invalid-argument", "CPF inválido.");

  if (cpf.length === 11) {
    const existente = await usuarioPorCpf(cpf);
    if (existente) {
      throw new HttpsError("already-exists", "Já existe um usuário cadastrado com este CPF.");
    }
  }

  const ref = db.collection("users").doc();
  const dados = {
    authUid: "",
    name: nome.toUpperCase().slice(0, 80),
    cpf: cpf || "",
    email: "",
    role: "user",
    status: "active",
    approved: true,
    allowCredit: true,
    creditLimit,
    currentDebt: 0,
    weeklySpent: 0,
    walletBalance: 0,
    phone: telefone,
    inmateCpf: "",
    inmateName: "",
    createdAt: new Date().toISOString(),
  };
  await ref.set(dados);
  await registrarAudit(caller.id, "CRIAR_CLIENTE_FIADO", { usuarioId: ref.id, nome: dados.name }, { creditLimit });
  return { ok: true, userId: ref.id };
});

// ──────────────────────────────────────────────
// ARQUIVAMENTO (rotina existente)
// ──────────────────────────────────────────────

/** Zera weeklySpent de todos os usuários uma vez por semana (na 2ª-feira). */
async function executarResetSemanal() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split("T")[0];

  const settingsRef = db.collection("settings").doc("maintenance");
  const settingsSnap = await settingsRef.get();
  const lastReset = settingsSnap.exists ? settingsSnap.data().lastWeeklyReset : "";

  if (lastReset === mondayStr) {
    return;
  }

  let totalZerados = 0;
  let snapshot = await db.collection("users").where("weeklySpent", ">", 0).limit(500).get();
  while (!snapshot.empty && totalZerados < 5000) {
    const batch = db.batch();
    snapshot.docs.forEach((d) => batch.update(d.ref, { weeklySpent: 0 }));
    await batch.commit();
    totalZerados += snapshot.size;
    snapshot = await db.collection("users").where("weeklySpent", ">", 0).limit(500).get();
  }

  // (coleção customer_accounts removida do sistema — fiado é gravado em users.
  //  Reset semanal aplica-se somente aos usuários cadastrados.)
  if (totalZerados > 0) {
    logger.info(`[WeeklyReset] ${totalZerados} usuários com cota semanal zerada.`);
  }

  await settingsRef.set({ lastWeeklyReset: mondayStr }, { merge: true });
  logger.info(`[WeeklyReset] Reset semanal de cota concluído (${mondayStr}).`);
}

exports.arquivarDadosAntigos = onSchedule({
  schedule: "0 3 * * *",
  timeZone: "America/Sao_Paulo",
  memory: "512MiB"
}, async (event) => {
  logger.info("Iniciando rotina automática de arquivamento (45 dias)...");

  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 45);
  const cutoffStr = dataLimite.toISOString();

  try {
    await executarResetSemanal();

    // Fechamento automático de sessões de caixa abandonadas (abertas há mais de
    // 20h) — impede que uma sessão esquecida/bloqueada impeça o operador de
    // abrir um novo caixa. Mantém status "closed" para compatibilidade total
    // com a UI, marcando autoClosed: true para a trilha de auditoria.
    try {
      const limiarAbandono = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      // Só query de igualdade (índice de campo único, sempre disponível);
      // o filtro por data é feito em memória para não depender de índice composto.
      const abertas = await db.collection("cash_sessions")
        .where("status", "==", "open")
        .limit(200)
        .get();
      const abandonadas = abertas.docs.filter((d) => {
        const abriu = d.data().openedAt;
        if (!abriu) return false;
        const t = typeof abriu.toDate === "function" ? abriu.toDate() : new Date(abriu);
        return t.getTime() <= new Date(limiarAbandono).getTime() && !isNaN(t.getTime());
      });
      if (abandonadas.length > 0) {
        const batch = db.batch();
        abandonadas.forEach((d) => {
          const saldo = Number(d.data().currentBalance || 0);
          batch.update(d.ref, {
            status: "closed",
            closedAt: admin.firestore.Timestamp.now(),
            closedBalance: saldo,
            expectedBalance: saldo,
            cashDifference: 0,
            balanceDiff: 0,
            hasDiscrepancy: false,
            autoClosed: true,
          });
        });
        await batch.commit();
        logger.info(`[Caixa] ${abandonadas.length} sessão(ões) de caixa abandonada(s) fechada(s) automaticamente.`);
      }
    } catch (e) {
      logger.warn("[Caixa] Falha no auto-fechamento de sessões abandonadas:", e.message);
    }

    const collections = [
      { name: "orders", dateField: "createdAt", skipPendentes: true },
      { name: "expenses", dateField: "date", skipPendentes: false },
      { name: "wallet_transactions", dateField: "createdAt", skipPendentes: true }
    ];

    // Guardas de idempotência mais antigas que 7 dias podem ser apagadas
    // (o dedupe só precisa das recentes).
    try {
      const cutoffGuard = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const guardas = await db.collection("request_guard")
        .where("createdAt", "<=", cutoffGuard)
        .limit(200)
        .get();
      if (!guardas.empty) {
        const batchGuard = db.batch();
        guardas.docs.forEach((d) => batchGuard.delete(d.ref));
        await batchGuard.commit();
        logger.info(`[Idempotência] ${guardas.size} guardas antigas removidas.`);
      }
    } catch (eGuard) {
      logger.warn("[Idempotência] Falha ao limpar guardas antigas:", eGuard.message);
    }

    let totalArchived = 0;

    // Cada documento é copiado para historico_geral e depois marcado como
    // arquivado (soft archive: deleted = true) — NUNCA deletado fisicamente,
    // preservando a trilha de auditoria. Itens pendentes (PIX aguardando
    // confirmação, depósitos pendentes) NUNCA são arquivados.
    for (const col of collections) {
      let pagina = await db.collection(col.name)
        .where(col.dateField, "<=", cutoffStr)
        .where("deleted", "!=", true)
        .limit(500)
        .get();
      let lote = 0;
      while (!pagina.empty && lote < 8 && totalArchived < 4000) {
        const loteDocs = pagina.docs.filter((doc) => {
          const d = doc.data();
          if (d.deleted === true) return false;
          if (!col.skipPendentes) return true;
          return String(d.status || "").toLowerCase() !== "pending";
        });
        if (loteDocs.length > 0) {
          const batchArquivo = db.batch();
          for (const doc of loteDocs) {
            const arquivadoRef = db.collection("historico_geral").doc();
            batchArquivo.set(arquivadoRef, {
              colecao: col.name,
              origem: col.name,
              arquivadoEm: new Date().toISOString(),
              documento: { id: doc.id, ...doc.data() },
            });
          }
          await batchArquivo.commit();
          logger.info(`Arquivados ${loteDocs.length} documentos da coleção '${col.name}' em historico_geral.`);

          const batchArchive = db.batch();
          loteDocs.forEach(doc => batchArchive.update(doc.ref, { deleted: true, archivedAt: new Date().toISOString() }));
          await batchArchive.commit();
          totalArchived += loteDocs.length;
        }
        lote++;

        pagina = await db.collection(col.name)
          .where(col.dateField, "<=", cutoffStr)
          .where("deleted", "!=", true)
          .limit(500)
          .get();
      }
    }

    if (totalArchived === 0) {
      logger.info("Nenhum dado antigo para arquivar hoje.");
      return;
    }

    logger.info(`Sucesso! Total de ${totalArchived} documentos movidos para historico_geral.`);
  } catch (error) {
    logger.error("Erro crítico na rotina de arquivamento:", error);
  }
});

// ──────────────────────────────────────────────
// SENHA MESTRA (definir/validar SOMENTE no servidor)
// Nunca trafega em texto puro para o cliente nem fica no doc público settings/general.
// ──────────────────────────────────────────────

/** Admin ─ define/atualiza a senha mestra (bcrypt no servidor). */
exports.definirSenhaMestra = onCall(async (request) => {
  await exigirAdminPrincipal(request);
  const nova = String(request.data?.senha || "");
  if (nova.length < 8) {
    throw new HttpsError("invalid-argument", "A senha mestra deve ter pelo menos 8 caracteres.");
  }
  const hash = await bcrypt.hash(nova, 12);
  await db.collection("settings").doc("private").set({ masterPasswordHash: hash }, { merge: true });
  await db.collection("settings").doc("general").update({
    secondaryPassword: admin.firestore.FieldValue.delete(),
    adminPassword: admin.firestore.FieldValue.delete(),
  }).catch(() => {});
  return { ok: true };
});

/** Autenticado ─ valida a senha mestra informada (bcrypt, nunca expõe o hash). */
exports.validarSenhaMestra = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  verificarRateLimit("validarSenhaMestra:" + user.id, 10);
  const roleLower = String(user.role || "").toLowerCase();
  if (roleLower !== "admin" && roleLower !== "master") {
    throw new HttpsError("permission-denied", "Apenas administradores podem validar a senha mestra.");
  }
  const informada = String(request.data?.senha || "");
  const privSnap = await db.collection("settings").doc("private").get();
  const priv = privSnap.exists ? privSnap.data() : {};
  if (priv.masterPasswordHash) {
    const ok = await bcrypt.compare(informada, priv.masterPasswordHash);
    return { ok, definida: true };
  }
  const genSnap = await db.collection("settings").doc("general").get();
  const gen = genSnap.exists ? genSnap.data() : {};
  const legada = String(gen.secondaryPassword || gen.adminPassword || "");
  if (!legada) return { ok: false, definida: false };
  const ok = informada === legada;
  if (ok) {
    const hash = await bcrypt.hash(legada, 12);
    await db.collection("settings").doc("private").set({ masterPasswordHash: hash }, { merge: true });
    await db.collection("settings").doc("general").update({
      secondaryPassword: admin.firestore.FieldValue.delete(),
      adminPassword: admin.firestore.FieldValue.delete(),
    }).catch(() => {});
  }
  return { ok, definida: true };
});

/**
 * Admin │ valida AMBAS as senhas antes de autorizar uma venda fiada:
 *  - primária  = senha de login do admin no Firebase Auth (re-auth via REST)
 *  - secundária= senha mestra / master password (bcrypt em settings/private)
 * Usado como gate no servidor para FIADO e FIADO_30, além da validação no front.
 */
exports.validarDuplaSenhaMestra = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  verificarRateLimit("validarDuplaSenhaMestra:" + user.id, 10);
  const roleLower = String(user.role || "").toLowerCase();
  if (roleLower !== "admin" && roleLower !== "master") {
    throw new HttpsError("permission-denied", "Apenas administradores podem validar a dupla senha mestra.");
  }
  const senhaPrimaria = String(request.data?.senhaPrimaria || "");
  const senhaSecundaria = String(request.data?.senhaSecundaria || "");
  const apiKey = String(request.data?.apiKey || "") || process.env.FIREBASE_API_KEY || "";

  if (!senhaPrimaria || !senhaSecundaria) {
    throw new HttpsError("invalid-argument", "Digite a senha primária e a secundária.");
  }

  const resultado = await validarDuplaSenhaServidor(user, senhaPrimaria, senhaSecundaria, apiKey);
  return { ok: !!resultado.ok, definida: true };
});

/**
 * Valida a dupla senha mestra no servidor:
 *  - primária   = senha de login do admin no Firebase Auth (re-auth via REST)
 *  - secundária = senha mestra (bcrypt em settings/private, com migração da legada)
 * Reutilizado pelo endpoint validarDuplaSenhaMestra e pelo gate de venda fiada.
 */
async function validarDuplaSenhaServidor(user, senhaPrimaria, senhaSecundaria, apiKey) {
  const sPrimaria = String(senhaPrimaria || "");
  const sSecundaria = String(senhaSecundaria || "");
  if (!sPrimaria || !sSecundaria) return { ok: false, motivo: "incompleta" };

  // Secundária ─ senha mestra (bcrypt), mesmo fluxo de validarSenhaMestra.
  const privSnap = await db.collection("settings").doc("private").get();
  const priv = privSnap.exists ? privSnap.data() : {};
  let secundariaOk = false;
  if (priv.masterPasswordHash) {
    secundariaOk = await bcrypt.compare(sSecundaria, priv.masterPasswordHash);
  } else {
    const genSnap = await db.collection("settings").doc("general").get();
    const gen = genSnap.exists ? genSnap.data() : {};
    const legada = String(gen.secondaryPassword || gen.adminPassword || "");
    if (legada) {
      secundariaOk = sSecundaria === legada;
      if (secundariaOk) {
        const hash = await bcrypt.hash(legada, 12);
        await db.collection("settings").doc("private").set({ masterPasswordHash: hash }, { merge: true });
        await db.collection("settings").doc("general").update({
          secondaryPassword: admin.firestore.FieldValue.delete(),
          adminPassword: admin.firestore.FieldValue.delete(),
        }).catch(() => {});
      }
    }
  }

  // Primária ─ senha de login do admin no Firebase Auth.
  // Fonte da verdade: re-auth REST com o email do próprio usuário logado.
  // Fallback tolerante: hash legado bcrypt em auth_secrets/{uid}.password
  // (mesmo usado no login do app) — cobre divergência de e-mail entre o
  // doc users e o Auth e a ausência de API key no payload/env.
  let primariaOk = false;
  const hashLegado = await obterHashLegado(user && user.id);
  if (hashLegado) {
    try {
      primariaOk = await bcrypt.compare(sPrimaria, hashLegado);
    } catch (e) {
      logger.warn("[validarDuplaSenhaServidor] Falha ao comparar hash legado:", e.message);
    }
  }
  if (!primariaOk && apiKey && user && user.email) {
    try {
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, password: sPrimaria, returnSecureToken: true }),
        }
      );
      primariaOk = resp.status === 200;
      if (!primariaOk) {
        logger.info("[validarDuplaSenhaServidor] Primária negada via REST (status " + resp.status + ").");
      }
    } catch (e) {
      logger.warn("[validarDuplaSenhaServidor] Falha ao validar primária via REST:", e.message);
    }
  } else if (!primariaOk) {
    logger.warn("[validarDuplaSenhaServidor] Primária validada somente pelo hash legado (sem API key/email).");
  }

  return { ok: primariaOk && secundariaOk, primariaOk, secundariaOk, definida: true };
}

/**
 * Valida UMA senha mestra no servidor para FIADO_30: a senha informada é
 * considerada correta se corresponder a QUALQUER uma das duas senhas:
 *  - secundária = senha mestra (bcrypt em settings/private, com migração legada)
 *  - primária   = senha de login do admin no Firebase Auth (re-auth via REST ou hash legado)
 * Usada no endpoint validarSenhaMestraUnica e no gate de venda fiada de 30 dias.
 */
async function validarSenhaUnicaServidor(user, senhaInformada, apiKey) {
  const senha = String(senhaInformada || "");
  if (!senha) return { ok: false, motivo: "vazia" };

  // Secundária ─ senha mestra (bcrypt), mesmo fluxo de verificarSenhaMestra.
  const privSnap = await db.collection("settings").doc("private").get();
  const priv = privSnap.exists ? privSnap.data() : {};
  let secundariaOk = false;
  if (priv.masterPasswordHash) {
    try {
      secundariaOk = await bcrypt.compare(senha, priv.masterPasswordHash);
    } catch (e) {
      logger.warn("[validarSenhaUnicaServidor] Falha ao comparar senha mestra:", e.message);
    }
  } else {
    const genSnap = await db.collection("settings").doc("general").get();
    const gen = genSnap.exists ? genSnap.data() : {};
    const legada = String(gen.secondaryPassword || gen.adminPassword || "");
    if (legada) {
      secundariaOk = senha === legada;
      if (secundariaOk) {
        const hash = await bcrypt.hash(legada, 12);
        await db.collection("settings").doc("private").set({ masterPasswordHash: hash }, { merge: true });
        await db.collection("settings").doc("general").update({
          secondaryPassword: admin.firestore.FieldValue.delete(),
          adminPassword: admin.firestore.FieldValue.delete(),
        }).catch(() => {});
      }
    }
  }

  // Primária ─ senha de login do admin no Firebase Auth (re-auth via REST).
  let primariaOk = false;
  const hashLegado = await obterHashLegado(user && user.id);
  if (hashLegado) {
    try {
      primariaOk = await bcrypt.compare(senha, hashLegado);
    } catch (e) {
      logger.warn("[validarSenhaUnicaServidor] Falha ao comparar hash legado primário:", e.message);
    }
  }
  if (!primariaOk && apiKey && user && user.email) {
    try {
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, password: senha, returnSecureToken: true }),
        }
      );
      primariaOk = resp.status === 200;
    } catch (e) {
      logger.warn("[validarSenhaUnicaServidor] Falha ao validar primária via REST:", e.message);
    }
  }

  return { ok: secundariaOk || primariaOk, secundariaOk, primariaOk, definida: true };
}

/**
 * Admin │ valida UMA senha mestra (primária OU secundária) para autorizar
 * venda fiada de 30 dias. Usado no front para conferir antes de finalizar.
 */
exports.validarSenhaMestraUnica = onCall(async (request) => {
  const user = await exigirAutenticado(request);
  verificarRateLimit("validarSenhaMestraUnica:" + user.id, 10);
  const roleLower = String(user.role || "").toLowerCase();
  if (roleLower !== "admin" && roleLower !== "master") {
    throw new HttpsError("permission-denied", "Apenas administradores podem validar a senha mestra.");
  }
  const senha = String(request.data?.senha || "");
  if (!senha) {
    throw new HttpsError("invalid-argument", "Digite a senha mestra.");
  }
  const apiKey = String(request.data?.apiKey || "") || process.env.FIREBASE_API_KEY || "";
  const resultado = await validarSenhaUnicaServidor(user, senha, apiKey);
  return { ok: !!resultado.ok, definida: true };
});

/** Autenticado ─ hora confiável do servidor (substitui APIs externas de horário). */
exports.obterHoraServidor = onCall(async (request) => {
  await exigirAutenticado(request);
  const agora = admin.firestore.Timestamp.now();
  return { hora: agora.toMillis(), timestamp: agora.toDate().toISOString() };
});

// ──────────────────────────────────────────────
// LIMPEZA MANUAL COM BACKUP (quando a cota atinge ~70%)
// Admin clica em "Limpar Dados Antigos": o servidor faz
//  1) backup completo em Storage (arquivo JSON, link de download válido por 7 dias)
//  2) cópia para historico_geral (trilha de auditoria, sem nunca perder nada)
//  3) marca como deleted:true (soft delete — os dados somem da operação, mas a
//     cópia de segurança permanece restaurable a qualquer momento)
// Segurança: exige admin ativo, NUNCA toca pedidos/depósitos pendentes.
// ──────────────────────────────────────────────

/** Admin ─ backup + limpeza de dados antigos (orders, wallet_transactions, expenses). */
exports.limparDadosAntigos = onCall({
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  // Só admin PRINCIPAL: apaga fisicamente comprovantes e até 12.000 docs —
  // poder destrutivo comparável ao de creditarSaldo, que exige senha mestra.
  const chamador = await exigirAdminPrincipal(request);
  const dias = Math.max(30, Math.min(730, Math.floor(Number(request.data?.dias) || 90)));
  const apagarArquivos = Boolean(request.data?.apagarArquivos);
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const bucket = admin.storage().bucket(FUNC_BUCKET);

  const colecoes = [
    { name: "orders", dateField: "createdAt", skipPendentes: true },
    { name: "wallet_transactions", dateField: "createdAt", skipPendentes: true },
    { name: "expenses", dateField: "date", skipPendentes: false },
  ];

  const backup = { geradoEm: new Date().toISOString(), dias, por: chamador.name || chamador.id, dados: {} };
  const totais = {};
  let totalApagados = 0;
  let arquivosApagados = 0;
  let arquivosFalha = 0;

  for (const col of colecoes) {
    totais[col.name] = 0;
    backup.dados[col.name] = [];
    let pagina = await db.collection(col.name)
      .where(col.dateField, "<=", cutoff)
      .where("deleted", "!=", true)
      .limit(500)
      .get();
    let lote = 0;
    // Limites de segurança: máx 4000 docs/coleção por execução, 8 lotes de 500.
    while (!pagina.empty && lote < 8 && backup.dados[col.name].length < 4000) {
      const loteDocs = pagina.docs.filter((d) => {
        const data = d.data();
        if (data.deleted === true) return false;
        if (!col.skipPendentes) return true;
        return String(data.status || "").toLowerCase() !== "pending";
      });
      if (loteDocs.length > 0) {
        const dadosLote = loteDocs.map((d) => ({ id: d.id, ...d.data() }));
        backup.dados[col.name].push(...dadosLote);
        // 1) Cópia para historico_geral (auditoria permanente)
        const batchCopy = db.batch();
        dadosLote.forEach((d) => {
          batchCopy.set(db.collection("historico_geral").doc(), {
            colecao: col.name,
            origem: col.name,
            arquivadoEm: new Date().toISOString(),
            motivo: "limpeza_manual_cota",
            documento: { id: d.id, ...d.data() },
          });
        });
        await batchCopy.commit();
        // 2) Soft delete nos ativos
        const batchSoft = db.batch();
        loteDocs.forEach((d) => batchSoft.update(d.ref, { deleted: true, archivedAt: new Date().toISOString() }));
        await batchSoft.commit();
        totais[col.name] += loteDocs.length;
        totalApagados += loteDocs.length;

        // 3) (Opcional) Apaga os arquivos de comprovante dos registros
        // arquivados — o Storage é o que realmente enche a cota do plano
        // gratuito. Só mexe em arquivos do nosso bucket e NUNCA em
        // documentos de identidade (pasta docs/). A URL continua registrada
        // no histórico (trilha de auditoria), apenas o arquivo é removido.
        if (apagarArquivos && col.name !== "expenses") {
          const campoUrl = col.name === "orders" ? "paymentProofUrl" : "proofUrl";
          const caminhos = [
            ...new Set(
              dadosLote
                .map((d) => (d[campoUrl] && typeof d[campoUrl] === "string" ? caminhoStorageDeUrl(d[campoUrl], FUNC_BUCKET) : null))
                .filter(Boolean)
            ),
          ];
          for (const caminho of caminhos) {
            try {
              await bucket.file(caminho).delete();
              arquivosApagados += 1;
            } catch (e) {
              arquivosFalha += 1;
              logger.warn(`[LimpezaCota] Falha ao apagar arquivo ${caminho}:`, e.message);
            }
          }
        }
      }
      lote++;
      if (backup.dados[col.name].length < 4000) {
        pagina = await db.collection(col.name)
          .where(col.dateField, "<=", cutoff)
          .where("deleted", "!=", true)
          .limit(500)
          .get();
      }
    }
  }

  if (totalApagados === 0) {
    return { ok: true, total: 0, porColecao: totais, arquivosApagados: 0, arquivosFalha: 0, backupUrl: "", mensagem: "Nenhum dado antigo encontrado dentro do período." };
  }

  // Backup físico em Storage (cópia de segurança independente do Firestore)
  let backupUrl = "";
  try {
    const nomeArquivo = `backups/limpeza-${Date.now()}.json`;
    await bucket.file(nomeArquivo).save(JSON.stringify(backup), {
      contentType: "application/json",
      resumable: false,
    });
    backupUrl = await urlDownloadComToken(bucket.file(nomeArquivo));
  } catch (e) {
    logger.warn("[LimpezaCota] Falha ao salvar backup no Storage (o histórico no Firestore já preserva tudo):", e.message);
  }

  await db.collection("settings").doc("maintenance").set({
    lastCotaCleanup: new Date().toISOString(),
    lastCotaCleanupBy: chamador.id,
    lastCotaCleanupDias: dias,
  }, { merge: true });

  return { ok: true, total: totalApagados, porColecao: totais, arquivosApagados, arquivosFalha, backupUrl, mensagem: "" };
});

/**
 * Admin PRINCIPAL — reset TOTAL do sistema (apaga as coleções operacionais).
 * Substitui o reset que rodava 100% no cliente (qualquer admin podia apagar
 * o banco inteiro com 1 clique). Agora só o admin principal, com rate limit.
 * Não toca em users/settings/suppliers/systemMessages/system_licenses
 * (mesmo comportamento da versão anterior, para não derrubar o cadastro).
 */
exports.resetarSistemaTotal = onCall({
  timeoutSeconds: 300,
  memory: "512MiB",
}, async (request) => {
  const chamador = await exigirAdminPrincipal(request);
  verificarRateLimit("reset_sistema_" + chamador.id, 1, 60 * 1000);
  if (request.data?.confirmar !== true) {
    throw new HttpsError("invalid-argument", "Confirmação explícita necessária.");
  }

  // audit_logs e historico_geral NÃO são apagados — preservados para
  // compliance (LGPD) e rastreabilidade de ações administrativas.
  const collections = [
    "products", "orders", "expenses", "wallet_transactions", "messages",
    "cashier", "cash_sessions", "pre_registered_inmates",
  ];
  const inicio = new Date().toISOString();
  const totais = {};
  for (const coll of collections) {
    const snap = await db.collection(coll).limit(2000).get();
    totais[coll] = snap.docs.length;
    for (let i = 0; i < snap.docs.length; i += 500) {
      const batch = db.batch();
      const chunk = snap.docs.slice(i, i + 500);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  await db.collection("audit_logs").add({
    operadorUid: chamador.id,
    timestamp: new Date().toISOString(),
    acaoTipo: "RESET_SISTEMA_TOTAL",
    payloadAntes: { totais, inicio },
    payloadDepois: { status: "ok" },
  });

  return { ok: true, totais };
});

// ──────────────────────────────────────────────
// DOWNLOAD DO APP (EXE / SETUP)
// ──────────────────────────────────────────────
// Regras de acesso por papel (servidor decide, nunca o cliente):
//  - FAMILY (usuário comum): pode baixar SOMENTE a versão "Usuário".
//  - ADMIN: pode baixar as duas versões ("Usuário" e "Administrador").
// Os executáveis ficam no Storage em apps/ e o link é assinado (7 dias).
// ──────────────────────────────────────────────

const APPS_DISPONIVEIS = [
  { chave: "usuario", arquivo: "apps/MercadoFacil-Usuario-Setup.exe", nome: "Mercado Fácil - Usuário", descricao: "App de compras para os familiares" },
  { chave: "admin", arquivo: "apps/MercadoFacil-Admin-Setup.exe", nome: "Mercado Fácil - Administrador", descricao: "Painel de gestão completa (PDV, estoque e relatórios)" },
];

/** Autenticado ─ gera links de download do app conforme o papel do chamador. */
exports.obterLinkDownloadApp = onCall({
  timeoutSeconds: 60,
}, async (request) => {
  const user = await exigirAutenticado(request);
  const ehAdmin = ["admin", "master"].includes(String(user.role || "").toLowerCase());

  const bucket = admin.storage().bucket(FUNC_BUCKET);
  const resultado = [];

  for (const app of APPS_DISPONIVEIS) {
    if (app.chave === "admin" && !ehAdmin) continue; // usuário comum NUNCA vê a versão admin
    try {
      const file = bucket.file(app.arquivo);
      const [existe] = await file.exists();
      if (!existe) {
        resultado.push({ chave: app.chave, nome: app.nome, descricao: app.descricao, disponivel: false, url: "", motivo: "nao_publicado" });
        continue;
      }
      // apps/ é de leitura pública nas regras de Storage — devolve a URL direta
      // (sem assinatura; getSignedUrl exige IAM signBlob que a service account
      // padrão do projeto não possui).
      const url = urlPublicaArquivo(file);
      resultado.push({ chave: app.chave, nome: app.nome, descricao: app.descricao, disponivel: true, url, motivo: "" });
    } catch (e) {
      logger.warn("[DownloadApp] Falha ao gerar link de " + app.chave + ":", e.message);
      resultado.push({ chave: app.chave, nome: app.nome, descricao: app.descricao, disponivel: false, url: "", motivo: "erro_servidor" });
    }
  }

  return { ok: true, ehAdmin, apps: resultado, versao: "1.0.0" };
});

// ──────────────────────────────────────────────
// BACKUP AUTOMÁTICO DIÁRIO + RESTAURAÇÃO SEGURA
// Cópia de segurança COMPLETA do Firestore para o Cloud Storage (pasta
// backups/), feita em streaming (memória baixa), com retenção de 30 dias
// e snapshot de segurança antes de qualquer restauração.
// ──────────────────────────────────────────────

// Coleções transitórias que NÃO entram no backup (regeneráveis sozinhas).
const COLS_SEM_BACKUP = new Set(["request_guard"]);

// Coleções SENSÍVEIS que nunca entram no backup (hash de senhas, segredos).
// auth_secrets guarda hashes bcrypt de senhas; settings/private guarda o hash
// da senha mestra. Excluí-las evita vazamento de credenciais em Storage e
// impede que restaurarBackup "reanime" senhas antigas (rotação de segurança).
const COLS_SEM_BACKUP_SENSIVEIS = new Set(["auth_secrets", "settings"]);

/**
 * Exporta TODAS as coleções (exceto as transitórias) para um JSON no Storage,
 * escrevendo em streaming com paginação por __name__ (sem índice composto).
 * Retorna { arquivo, bytes, totalDocs, porColecao }.
 */
async function gerarBackupCompleto(caminho, motivo, por) {
  const bucket = admin.storage().bucket(FUNC_BUCKET);
  const arquivo = bucket.file(caminho);
  const stream = arquivo.createWriteStream({
    contentType: "application/json",
    resumable: false,
    validation: false,
  });

  const porColecao = {};
  let totalDocs = 0;

  await new Promise((resolve, reject) => {
    const escrever = (texto) =>
      new Promise((ok) => stream.write(texto, ok));
    (async () => {
      try {
        const colecoes = await db.listCollections();
        await escrever(`{"__meta":{"geradoEm":"${new Date().toISOString()}","motivo":"${motivo}","por":"${por}","versao":1},`);
        let primeira = true;
        for (const col of colecoes) {
          const nome = col.id;
          // Transitórias (regeneráveis) e sensíveis (hashes/segredos) ficam fora.
          if (COLS_SEM_BACKUP.has(nome) || COLS_SEM_BACKUP_SENSIVEIS.has(nome)) continue;
          await escrever(`${primeira ? "" : ","}${JSON.stringify(nome)}:[`);
          let n = 0;
          let cursor = null;
          let primeiroDoc = true;
          do {
            const base = db.collection(nome).orderBy("__name__").limit(300);
            const pagina = cursor
              ? await base.startAfter(cursor).get()
              : await base.get();
            if (pagina.empty) break;
            cursor = pagina.docs[pagina.docs.length - 1];
            for (const d of pagina.docs) {
              await escrever(`${primeiroDoc ? "" : ","}${JSON.stringify({ __id: d.id, ...d.data() })}`);
              primeiroDoc = false;
              n++;
            }
            totalDocs += pagina.docs.length;
            if (n >= 50000) break; // salvaguarda: nunca estoura tempo/memória
          } while (cursor);
          await escrever("]");
          porColecao[nome] = n;
          primeira = false;
        }
        await escrever("}");
        stream.end();
      } catch (e) {
        stream.destroy(e);
      }
    })();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  const [meta] = await arquivo.getMetadata();
  const bytes = Number(meta.size || 0);
  logger.info(`[Backup] ${caminho} — ${totalDocs} docs, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  return { arquivo: caminho, bytes, totalDocs, porColecao };
}

/** Apaga backups com mais de `dias` (mantém no mínimo `minimo` mais recentes). */
async function limparBackupsAntigos(dias = 30, minimo = 3, prefixo = "backups/diario-", padrao = /diario-(\d+)\.json$/) {
  try {
    const bucket = admin.storage().bucket(FUNC_BUCKET);
    const [files] = await bucket.getFiles({ prefix: prefixo });
    const corte = Date.now() - dias * 24 * 60 * 60 * 1000;
    const paraApagar = files
      .filter((f) => {
        const m = f.name.match(padrao);
        if (!m) return false;
        return Number(m[1]) < corte;
      })
      .sort((a, b) => a.name.localeCompare(b.name)); // mais antigos primeiro
    // Mantém sempre os `minimo` mais recentes, mesmo que antigos.
    const sobrantes = Math.max(0, paraApagar.length - minimo);
    await Promise.all(paraApagar.slice(0, sobrantes).map((f) => f.delete().catch(() => {})));
    if (sobrantes > 0) logger.info(`[Backup] ${sobrantes} backup(s) antigo(s) removido(s) (${prefixo}, retenção de ${dias} dias).`);
  } catch (e) {
    logger.warn("[Backup] Falha ao limpar backups antigos:", e.message);
  }
}

/** Agendado — backup completo diário às 03:15 (hora de Mato Grosso). */
exports.backupAutomaticoDiario = onSchedule({
  schedule: "15 3 * * *",
  timeZone: "America/Cuiaba",
  timeoutSeconds: 540,
  memory: "1GiB",
}, async () => {
  const inicio = Date.now();
  try {
    const nome = `backups/diario-${Date.now()}.json`;
    const r = await gerarBackupCompleto(nome, "diario", "sistema");
    await limparBackupsAntigos(30, 3);
    await db.collection("settings").doc("maintenance").set({
      lastBackup: new Date().toISOString(),
      lastBackupFile: r.arquivo,
      lastBackupDocs: r.totalDocs,
      lastBackupBytes: r.bytes,
      lastBackupDurationMs: Date.now() - inicio,
      lastBackupStatus: "ok",
    }, { merge: true });
  } catch (e) {
    // Registra a falha no maintenance (não re-throw: evita alertas falsos no
    // Cloud Scheduler para a mesma causa que a função seguinte já tenta corrigir).
    console.error("[backupAutomaticoDiario] falha:", e);
    await db.collection("settings").doc("maintenance").set({
      lastBackup: new Date().toISOString(),
      lastBackupStatus: "error",
      lastBackupError: String((e && e.message) || e).slice(0, 500),
      lastBackupDurationMs: Date.now() - inicio,
    }, { merge: true }).catch(() => {});
  }
});

/** Agendado — backup de COMPLETUDE semanal (quarta-feira 03:30 MT), retenção longa (180 dias). */
// ============================================================
// TTL COMPROVANTES (15 dias apos aprovacao do admin): rotina
// diaria que apaga os arquivos de comprovante do Storage e limpa
// o campo paymentProofUrl/proofUrl dos pedidos/depositos antigos,
// liberando espaco no banco. Mantem o doc (trilha de auditoria).
// ============================================================
exports.limparComprovantesExpirados = onSchedule({
  schedule: "30 4 * * *",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
  memory: "512MiB"
}, async () => {
  const corteMs = 15 * 24 * 60 * 60 * 1000;
  const corte = new Date(Date.now() - corteMs).toISOString();
  const bucket = admin.storage().bucket(FUNC_BUCKET);
  let apagados = 0, docsLimpos = 0;

  const alvos = [
    { col: "orders", dateField: "approvedAt", urlField: "paymentProofUrl",
      statusValidos: ["paid","pago","approved","preparing","preparando","out_for_delivery","saiu","delivered","entregue","concluido","finalizado"] },
    { col: "wallet_transactions", dateField: "approvedAt", urlField: "proofUrl",
      statusValidos: ["approved"] },
  ];

  for (const alvo of alvos) {
    try {
      let pagina = await db.collection(alvo.col)
        .where(alvo.dateField, "<=", corte)
        .limit(200)
        .get();
      while (!pagina.empty && docsLimpos < 4000) {
        const lote = pagina.docs.filter((d) => {
          const dt = d.data();
          const st = String(dt.status || "").toLowerCase();
          if (dt.deleted === true) return false;
          return alvo.statusValidos.includes(st) || alvo.statusValidos.some((s) => st.includes(s));
        });
        const batch = db.batch();
        for (const d of lote) {
          const dt = d.data();
          const url = String(dt[alvo.urlField] || "").trim();
          if (url && url !== "PENDENTE_UPLOAD_LOCAL_CACHE" && url.startsWith("https://")) {
            try {
              const caminho = caminhoStorageDeUrl(url, FUNC_BUCKET);
              if (caminho) await bucket.file(caminho).delete();
              apagados++;
            } catch (eDel) {
              logger.warn(`[TTL] Falha ao apagar arquivo (${alvo.col}/${d.id}):`, eDel.message);
            }
          }
          batch.update(d.ref, { [alvo.urlField]: "", comprovanteRemovidoEm: new Date().toISOString() });
          docsLimpos++;
        }
        if (lote.length > 0) await batch.commit();
        const ult = pagina.docs[pagina.docs.length - 1];
        pagina = await db.collection(alvo.col)
          .where(alvo.dateField, "<=", corte)
          .orderBy(alvo.dateField)
          .startAfter(ult)
          .limit(200)
          .get();
      }
    } catch (e) {
      logger.warn(`[TTL] Erro na colecao ${alvo.col}:`, e.message);
    }
  }
  logger.info(`[TTL] Comprovantes apagados=${apagados} | docs limpos=${docsLimpos}`);
  return { ok: true, apagados, docsLimpos };
});
exports.backupSemanalAutomatico = onSchedule({
  schedule: "30 3 * * 3",
  timeZone: "America/Cuiaba",
  timeoutSeconds: 540,
  memory: "1GiB",
}, async () => {
  const inicio = Date.now();
  try {
    const nome = `backups/semanal-${Date.now()}.json`;
    const r = await gerarBackupCompleto(nome, "semanal", "sistema");
    // Retenção longa: 180 dias, mantendo no mínimo 2 backups semanais.
    await limparBackupsAntigos(180, 2, "backups/semanal-", /semanal-(\d+)\.json$/);
    await db.collection("settings").doc("maintenance").set({
      lastWeeklyBackup: new Date().toISOString(),
      lastWeeklyBackupFile: r.arquivo,
      lastWeeklyBackupDocs: r.totalDocs,
      lastWeeklyBackupBytes: r.bytes,
      lastWeeklyBackupStatus: "ok",
      lastWeeklyBackupDurationMs: Date.now() - inicio,
    }, { merge: true });
  } catch (e) {
    console.error("[backupSemanalAutomatico] falha:", e);
    await db.collection("settings").doc("maintenance").set({
      lastWeeklyBackup: new Date().toISOString(),
      lastWeeklyBackupStatus: "error",
      lastWeeklyBackupError: String((e && e.message) || e).slice(0, 500),
      lastWeeklyBackupDurationMs: Date.now() - inicio,
    }, { merge: true }).catch(() => {});
  }
});

/** Admin — dispara um backup manual imediatamente. */
exports.executarBackupAgora = onCall({
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  const chamador = await exigirAdmin(request);
  const nome = `backups/manual-${Date.now()}.json`;
  const r = await gerarBackupCompleto(nome, "manual", chamador.id);
  return { ok: true, ...r };
});

/** Admin — lista os backups disponíveis (nome, tamanho, data). */
exports.listarBackups = onCall(async (request) => {
  await exigirAdmin(request);
  const bucket = admin.storage().bucket(FUNC_BUCKET);
  const [files] = await bucket.getFiles({ prefix: "backups/" });
  const backups = files
    .filter((f) => /\.json$/.test(f.name))
    .map((f) => ({
      nome: f.name,
      tamanho: Number(f.metadata.size || 0),
      atualizadoEm: f.metadata.updated || "",
    }))
    .sort((a, b) => b.nome.localeCompare(a.nome));
  return { ok: true, backups };
});

/** Admin PRINCIPAL — gera link de download (token) de um backup específico. */
exports.baixarBackup = onCall(async (request) => {
  await exigirAdminPrincipal(request);
  const nome = String(request.data?.nome || "");
  if (!/^backups\/[\w.-]+\.json$/.test(nome)) {
    throw new HttpsError("invalid-argument", "Nome de backup inválido.");
  }
  const file = admin.storage().bucket(FUNC_BUCKET).file(nome);
  const [existe] = await file.exists();
  if (!existe) throw new HttpsError("not-found", "Backup não encontrado.");
  return { ok: true, url: await urlDownloadComToken(file) };
});

/**
 * Admin — restaura um backup completo. Exige, em ordem:
 *   1. admin ativo
 *   2. senha mestra válida (settings/private.masterPasswordHash)
 *   3. confirmação explícita (confirmar: true)
 * ANTES de restaurar, tira um snapshot de segurança do estado atual
 * (backups/pre-restore-{timestamp}.json) — nada é perdido.
 */
exports.restaurarBackup = onCall({
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  const chamador = await exigirAdminPrincipal(request);
  const nome = String(request.data?.nome || "");
  const confirmar = request.data?.confirmar === true;
  const senhaMestra = String(request.data?.senhaMestra || "");

  if (!confirmar) throw new HttpsError("failed-precondition", "Confirmação obrigatória para restaurar.");
  if (!/^backups\/(diario|semanal)-[\d]+\.json$/.test(nome)) {
    throw new HttpsError("invalid-argument", "Selecione um backup diário ou semanal válido.");
  }

  await verificarSenhaMestra(senhaMestra);

  // 1) Snapshot de segurança do estado ATUAL (antes de qualquer escrita).
  try {
    await gerarBackupCompleto(`backups/pre-restore-${Date.now()}.json`, "pre_restore", chamador.id);
  } catch (e) {
    logger.warn("[Restore] Falha no snapshot de segurança (continuando mesmo assim):", e.message);
  }

  // 2) Baixa o backup escolhido e aplica por coleção (lote de 450 docs).
  const file = admin.storage().bucket(FUNC_BUCKET).file(nome);
  const [buf] = await file.download();
  const dados = JSON.parse(buf.toString("utf8"));
  const totais = {};
  let total = 0;

  for (const [col, docs] of Object.entries(dados)) {
    if (col === "__meta" || COLS_SEM_BACKUP.has(col) || COLS_SEM_BACKUP_SENSIVEIS.has(col) || !Array.isArray(docs)) continue;
    let n = 0;
    for (let i = 0; i < docs.length; i += 450) {
      const lote = docs.slice(i, i + 450);
      const batch = db.batch();
      lote.forEach((d) => {
        const { __id, ...resto } = d;
        if (!__id) return;
        batch.set(db.collection(col).doc(__id), resto, { merge: false });
      });
      await batch.commit();
      n += lote.length;
    }
    totais[col] = n;
    total += n;
  }

  await db.collection("settings").doc("maintenance").set({
    lastRestore: new Date().toISOString(),
    lastRestoreFile: nome,
    lastRestoreBy: chamador.id,
    lastRestoreDocs: total,
    lastRestoreStatus: "ok",
  }, { merge: true });

  logger.info(`[Restore] ${nome} restaurado por ${chamador.id}: ${total} docs.`);
  return { ok: true, totais, totalDocs: total };
});

// ──────────────────────────────────────────────
// Firebase Alerts (Alert Center)
// ──────────────────────────────────────────────
// Captura alertas do tópico Pub/Sub `firebase-alerts` (monitoramento de
// erros/uso) e persiste um registro auditável em alerts_log + último
// alerta em settings/maintenance (consultável pelo painel admin).
//
// IMPORTANTE: o envio de E-MAIL é configurado no console (passo manual
// de 2 min — Monitoramento > Alertas > Criar regra > Canal: e-mail).
// Esta função NÃO envia e-mail: apenas registra o alerta de forma
// persistente e acionável dentro do app. Sem regra criada no console o
// tópico não existe e/ou nada chega aqui — o deploy desta função exige
// que ao menos uma regra de alerta esteja ativa no console.
const { onCustomEventPublished } = require("firebase-functions/v2/eventarc");

exports.tratarAlertasFirebase = onCustomEventPublished(
  "firebase.alerts/alert",
  { retry: false, timeoutSeconds: 30 },
  async (event) => {
    try {
      const alerta = event.data || {};
      const tipo = String(alerta.alertType || alerta.type || "desconhecido").slice(0, 80);
      const severidade = String(alerta.severity || "WARNING").toUpperCase().slice(0, 10);
      const titulo = String(alerta.title || tipo).slice(0, 160);
      const det = alerta.data || {};

      await db.collection("alerts_log").add({
        tipo,
        severidade,
        titulo,
        mensagem: String(det.message || det.errorCount || "").slice(0, 1000),
        origem: String(det.service || det.jobName || det.appId || "").slice(0, 120),
        payload: JSON.stringify(alerta).slice(0, 3000),
        criadoEm: new Date().toISOString(),
      });

      await db.collection("settings").doc("maintenance").set({
        lastFirebaseAlert: {
          tipo,
          severidade,
          titulo,
          criadoEm: new Date().toISOString(),
        },
      }, { merge: true });

      logger.info(`[Alerts] ${severidade} ${tipo}: ${titulo}`);
    } catch (e) {
      logger.warn("[Alerts] Falha ao processar alerta (sem abortar):", e.message);
    }
  }
);





