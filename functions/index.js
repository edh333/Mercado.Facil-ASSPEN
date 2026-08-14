const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const cleanCpf = (v) => String(v || "").replace(/\D/g, "");
const arredondar = (v) => Math.round((Number(v) || 0) * 100) / 100;

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

// Rate limiting em memória (por instância de função) — janela deslizante por chave.
// Suficiente para conter abuso de endpoints públicos/autenticados: os mapas são
// pequenos (uma entrada por chave única) e expiram sozinhos com o tempo.
const rateLimitMap = new Map();
const RATE_LIMIT_JANELA_MS = 60 * 1000;

function verificarRateLimit(chave, maxChamadasPorJanela, janelaMs = RATE_LIMIT_JANELA_MS) {
  const agora = Date.now();
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
  const txId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
});

/**
 * Público — cria a conta no Firebase Auth + documento do usuário.
 * Com `provisionar: true`, vincula a conta a um usuário existente (migração),
 * validando a senha atual contra o hash armazenado.
 */
exports.registrarUsuario = onCall(async (request) => {
  const ip = ipDoRequest(request);
  verificarRateLimit("registrarUsuario:" + ip, 10);
  const dados = request.data?.dados || {};
  const senha = String(request.data?.senha || "");
  const provisionar = Boolean(request.data?.provisionar);
  const cpf = cleanCpf(dados.cpf);
  if (cpf.length === 11) verificarRateLimit("registrarUsuarioCpf:" + cpf, 3);

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
      throw new HttpsError("internal", "Falha ao vincular conta: " + e.message);
    }
  }

  if (existente) throw new HttpsError("already-exists", "CPF já cadastrado.");

  const role = String(dados.role || "user") === "FAMILY" ? "FAMILY" : "user";

  // Validação do interno pré-cadastrado (server-side, já que o cliente ainda não está autenticado)
  const inmateCpf = cleanCpf(dados.inmateCpf);
  if (inmateCpf.length === 11 && role === "FAMILY") {
    const preSnap = await db.collection("pre_registered_inmates")
      .where("cpf", "==", inmateCpf).limit(1).get();
    const preTotal = await db.collection("pre_registered_inmates").limit(1).get();
    if (!preSnap.empty) {
      const preDoc = preSnap.docs[0];
      const preName = String(preDoc.data().name || "").slice(0, 120);
      if (!dados.inmateName && preName) dados.inmateName = preName;
      if (!dados.prisonerName && preName) dados.prisonerName = preName;
    } else if (!preTotal.empty) {
      throw new HttpsError(
        "invalid-argument",
        "O interno informado não está pré-cadastrado no sistema. Por favor, entre em contato com a administração."
      );
    }
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
    throw new HttpsError("already-exists", "Falha ao criar conta: " + e.message);
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
      t.set(claimRef, { claimed: true, claimedAt: admin.firestore.Timestamp.now() });
    });
  } catch (e) {
    throw new HttpsError("already-exists", e.message || "Já existe um administrador. Faça login.");
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
  await db.collection("users").doc(authUser.uid).set({
    id: authUser.uid,
    authUid: authUser.uid,
    name: nome,
    email,
    cpf: cpf || "00000000000",
    role: "admin",
    status: "active",
    approved: true,
    permissions: ["all"],
    walletBalance: 0,
    weeklySpent: 0,
    createdBy: caller.id,
    createdAt: new Date().toISOString(),
  });
  await salvarHashLegado(authUser.uid, hash);
  await registrarAudit(caller.id, "CRIAR_ADMIN", null, { usuarioId: authUser.uid, nome, email, cpf: cpf || null });
  return { ok: true, userId: authUser.uid };
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
  const caller = await exigirAdmin(request);
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
  const apenasValidacao = String(request.data?.novaSenha || "") === "__VALIDACAO__";
  const novaSenha = apenasValidacao ? "" : validarSenha(request.data?.novaSenha);
  if (cpf.length !== 11) throw new HttpsError("invalid-argument", "CPF do usuário inválido.");
  if (cpfInterno.length !== 11) throw new HttpsError("invalid-argument", "CPF do interno inválido.");

  const usuario = await usuarioPorCpf(cpf);
  if (!usuario) throw new HttpsError("not-found", "Usuário não encontrado.");

  const cpfInternoDoc = cleanCpf(usuario.inmateCpf || usuario.prisonerCpf || "");
  if (cpfInternoDoc !== cpfInterno) {
    throw new HttpsError("permission-denied", "CPF do interno não confere com o cadastro.");
  }

  // Contagem de tentativas somente após confirmar que o CPF pertence a um usuário válido
  const bloqueioRef = db.collection("security_events").doc("rec_" + cpf);
  const bloqueio = await bloqueioRef.get();
  if (bloqueio.exists) {
    const bd = bloqueio.data();
    const janelaMs = 10 * 60 * 1000;
    const primeiro = bd.primeiraTentativa ? new Date(bd.primeiraTentativa).getTime() : 0;
    if (Date.now() - primeiro < janelaMs && (Number(bd.contagem) || 0) >= 5) {
      throw new HttpsError(
        "resource-exhausted",
        "Muitas tentativas de recuperação para este CPF. Aguarde alguns minutos."
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
  const caller = await exigirAdmin(request);
  const tid = String(request.data?.transacaoId || "");
  if (!tid) throw new HttpsError("invalid-argument", "Transação inválida.");

  let novoSaldoFinal = null;
  let valorDepositado = null;
  let usuarioIdDeposito = null;
  try {
    await db.runTransaction(async (t) => {
      const tRef = db.collection("wallet_transactions").doc(tid);
      const tSnap = await t.get(tRef);
      if (!tSnap.exists) throw new Error("Transação não encontrada.");
      const tx = tSnap.data();
      if (tx.status !== "pending") throw new Error("Esta transação já foi processada.");
      if (tx.type !== "deposit") throw new Error("Transação não é um depósito.");
      if (!(Number(tx.amount) > 0)) throw new Error("Valor de depósito inválido.");
      if (Number(tx.amount) > 100000) throw new Error("Valor de depósito acima do teto permitido (R$ 100.000,00).");
      const comprovante = String(tx.proofUrl || "").trim();
      if (!comprovante || comprovante === "PENDENTE_UPLOAD_LOCAL_CACHE") {
        throw new Error("Depósito sem comprovante válido. Exija o envio da imagem do comprovante.");
      }
      if (!(await comprovanteEhDoUsuario(comprovante, tx.userId, "wallet_proofs"))) {
        throw new Error("Comprovante do depósito inválido (não pertence a este usuário).");
      }

      const uRef = db.collection("users").doc(tx.userId);
      const uSnap = await t.get(uRef);
      if (!uSnap.exists) throw new Error("Usuário não encontrado.");
      const novoSaldo = arredondar(Number(uSnap.data().walletBalance || 0) + Number(tx.amount || 0));
      novoSaldoFinal = novoSaldo;
      valorDepositado = arredondar(tx.amount || 0);
      usuarioIdDeposito = tx.userId;

      t.update(tRef, { status: "approved", approvedBy: caller.name || caller.id, approvedAt: new Date().toISOString() });
      t.update(uRef, { walletBalance: novoSaldo });
    });
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message || "Falha ao aprovar depósito.");
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
    throw new HttpsError("invalid-argument", e.message || "Falha ao rejeitar depósito.");
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

  let novoSaldoFinal = null;
  let saldoAnterior = null;
  let usuarioAlvo = null;
  await db.runTransaction(async (t) => {
    const uRef = db.collection("users").doc(userId);
    const uSnap = await t.get(uRef);
    if (!uSnap.exists) throw new Error("Usuário não encontrado.");
    const ud = uSnap.data();
    const novoSaldo = arredondar(Number(ud.walletBalance || 0) + valor);
    novoSaldoFinal = novoSaldo;
    saldoAnterior = arredondar(Number(ud.walletBalance || 0));
    usuarioAlvo = ud.name || userId;
    t.update(uRef, { walletBalance: novoSaldo });
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

/** Admin — retirada de saldo (débito) de qualquer usuário. */
exports.sacarSaldoAdmin = onCall(async (request) => {
  const caller = await exigirAdmin(request);
  const userId = String(request.data?.userId || "");
  const valor = validarValor(request.data?.valor);
  const motivo = String(request.data?.motivo || "Retirada de crédito").slice(0, 200);

  let novoSaldoFinal = null;
  let saldoAnterior = null;
  let usuarioAlvo = null;
  await db.runTransaction(async (t) => {
    const uRef = db.collection("users").doc(userId);
    const uSnap = await t.get(uRef);
    if (!uSnap.exists) throw new Error("Usuário não encontrado.");
    const ud = uSnap.data();
    if (Number(ud.walletBalance || 0) < valor) throw new Error("Saldo insuficiente.");
    const novoSaldo = arredondar(Number(ud.walletBalance || 0) - valor);
    novoSaldoFinal = novoSaldo;
    saldoAnterior = arredondar(Number(ud.walletBalance || 0));
    usuarioAlvo = ud.name || userId;
    t.update(uRef, { walletBalance: novoSaldo });
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
  });

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
    if (Number(ud.walletBalance || 0) < valor) throw new Error(`Saldo insuficiente! Disponível: R$ ${Number(ud.walletBalance || 0).toFixed(2)}`);
    const novoSaldo = arredondar(Number(ud.walletBalance || 0) - valor);
    novoSaldoFinal = novoSaldo;
    t.update(uRef, { walletBalance: novoSaldo });
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
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new HttpsError("invalid-argument", "Lista de itens vazia.");
  }
  const agregados = new Map();
  for (const raw of itens) {
    const productId = String(raw?.productId || "");
    const quantity = Math.floor(Number(raw?.quantity) || 0);
    if (!productId || quantity <= 0) {
      throw new HttpsError("invalid-argument", "Item inválido na lista de compras (produto ou quantidade incorretos).");
    }
    agregados.set(productId, (agregados.get(productId) || 0) + quantity);
  }
  return Array.from(agregados.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Valida se uma URL de Storage pertence ao bucket do projeto e à pasta privada
 * do usuário ({pasta}/{uid}/...). Impede usar comprovante de outro usuário ou
 * de outro projeto Firebase para confirmar um pedido/depósito.
 */
async function comprovanteEhDoUsuario(url, uid, pasta) {
  const u = String(url || "").trim();
  if (!u.startsWith("https://firebasestorage.googleapis.com/v0/b/")) return false;
  if (!u.includes("mercado-facil-mt.appspot.com") && !u.includes("mercado-facil-mt.firebasestorage.app")) return false;
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
  const token = String(clientToken || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
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
  const token = String(clientToken || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!token) return;
  t.set(db.collection("request_guard").doc(`venda_${token}`), {
    type: "venda",
    userId,
    orderId,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

function lerClientToken(data) {
  return String(data?.clientToken || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

/**
 * Admin — venda no PDV. Calcula TUDO no servidor (preços, saldo, estoque),
 * debita carteira quando houver, registra caixa físico e cria o pedido.
 */
exports.processarVendaAdmin = onCall(async (request) => {
  const caller = await exigirAdmin(request);
  const targetUserId = String(request.data?.targetUserId || "balcao_anonimo");
  const paymentMethod = String(request.data?.paymentMethod || "CASH");
  const itens = validarItens(request.data?.items);
  const payments = Array.isArray(request.data?.payments) ? request.data.payments : undefined;
  const change = request.data?.change === undefined || request.data?.change === null ? undefined : Number(request.data.change);
  if (change !== undefined && !Number.isFinite(change)) {
    throw new HttpsError("invalid-argument", "Troco inválido.");
  }
  const customerAccountId = request.data?.customerAccountId ? String(request.data.customerAccountId) : null;

  const isConsumer = targetUserId === "consumidor_geral" || targetUserId === "balcao_anonimo";
  const metodosValidos = ["PIX", "WALLET", "CASH", "CARD", "FIADO", "MIXED"];
  if (!metodosValidos.includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  }

  let walletPortion = 0;
  let cashPortion = 0;
  if (paymentMethod === "WALLET") {
    walletPortion = arredondar(Number(request.data?.total) || 0);
  } else if (paymentMethod === "MIXED") {
    if (!payments || payments.length === 0) throw new HttpsError("invalid-argument", "Pagamento misto sem valores.");
    for (const p of payments) {
      if (!metodosValidos.includes(p.method)) throw new HttpsError("invalid-argument", "Método inválido no pagamento misto.");
      if (!isFinite(Number(p.amount)) || Number(p.amount) < 0) throw new HttpsError("invalid-argument", "Valor inválido no pagamento misto.");
      if (p.method === "WALLET") walletPortion = arredondar(walletPortion + Number(p.amount));
      if (p.method === "CASH") cashPortion = arredondar(cashPortion + Number(p.amount));
    }
  } else if (paymentMethod === "CASH") {
    // cashPortion será = total calculado NO SERVIDOR (dentro da transação)
    cashPortion = 0;
  }

  const orderId = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase() : Math.random().toString(36).slice(2, 14)).toUpperCase();

  // Auditoria PIX: a venda só chega aqui DEPOIS que o operador confirmou o recebimento
  // (o frontend bloqueia a finalização sem confirmação). Registra quem/ quando confirmou.
  const temPartePix = paymentMethod === "PIX" ||
    (paymentMethod === "MIXED" && (payments || []).some((p) => p.method === "PIX"));
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
  const temParteCash = paymentMethod === "CASH" ||
    (paymentMethod === "MIXED" && (payments || []).some((p) => p.method === "CASH"));
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

      if (temParteCash) {
        cashPortion = paymentMethod === "CASH" ? total : cashPortion;
        if (!sessaoCaixa) throw new Error("Nenhuma sessão de caixa aberta para este operador. Abra o caixa antes de vender em dinheiro.");
        const sessaoAtual = await t.get(refSessaoCaixa(sessaoCaixa));
        if (!sessaoAtual.exists || String(sessaoAtual.data().status || "").toUpperCase() !== "OPEN") {
          throw new Error("A sessão de caixa foi fechada. Reabra o caixa antes de vender em dinheiro.");
        }
      }

    if (paymentMethod === "MIXED") {
      const somaPagamentos = arredondar((payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
      if (somaPagamentos !== total) throw new Error("A soma dos pagamentos não confere com o total.");
      if (walletPortion > total) throw new Error("Valor de carteira excede o total.");
      if (payments.some((p) => p.method === "FIADO" || p.method === "CARD")) {
        throw new Error("FIADO e CARD não são suportados em pagamento misto. Use somente PIX, WALLET e/ou CASH.");
      }
      if (isConsumer && walletPortion > 0) {
        throw new Error("Venda para consumidor final não pode usar carteira.");
      }
    }
    if (paymentMethod === "WALLET" && !isConsumer) {
      walletPortion = total;
    }
    if (paymentMethod === "WALLET" && isConsumer) {
      throw new Error("Venda para consumidor final não pode usar carteira.");
    }

    let userData = null;
    let clienteFiadoNome = null;
    if (((walletPortion > 0 || paymentMethod === "WALLET") || (paymentMethod === "FIADO" && !isConsumer)) && !isConsumer) {
      const uSnap = await t.get(db.collection("users").doc(targetUserId));
      if (uSnap.exists) {
        userData = { ...uSnap.data(), id: uSnap.id };
      } else if (walletPortion > 0) {
        throw new Error("Usuário não encontrado.");
      }
      if (walletPortion > 0) {
        if (Number(userData.walletBalance || 0) < walletPortion) throw new Error("Saldo insuficiente na carteira.");
        // Limite semanal de compras com carteira vale TAMBÉM para o PDV administrativo
        // (mesma regra do comprarComCarteira; isento apenas com autorização excepcional).
        if (!userData.autorizacaoExcepcional) {
          const cfgSnap = await t.get(db.collection("settings").doc("general"));
          const cfg = cfgSnap.exists ? cfgSnap.data() : {};
          const limite = Number(cfg.weeklyWalletLimit) || 300;
          if (arredondar((userData.weeklySpent || 0) + walletPortion) > limite) {
            throw new Error(
              `Limite semanal excedido. Disponível: R$ ${arredondar(limite - (userData.weeklySpent || 0)).toFixed(2)}`
            );
          }
        }
      }
    }

    // FIADO: validação e registro de dívida NO SERVIDOR (atômico com a venda)
    if (paymentMethod === "FIADO") {
      if (isConsumer) throw new Error("Venda fiada exige cliente cadastrado.");
      if (!customerAccountId) throw new Error("Selecione um cliente de fiado.");
      const caRef = db.collection("customer_accounts").doc(customerAccountId);
      const caSnap = await t.get(caRef);
      if (!caSnap.exists) throw new Error("Cliente de fiado não encontrado.");
      const contaFiado = caSnap.data();
      clienteFiadoNome = String(contaFiado.nome || contaFiado.name || contaFiado.clienteNome || "Fiado").slice(0, 80);
      if (String(contaFiado.status || "").toLowerCase() === "blocked") {
        throw new Error("Cliente bloqueado para venda fiada.");
      }
      const dividaAtual = Number(contaFiado.currentDebt || 0);
      const limiteCredito = Number(contaFiado.creditLimit || 0);
      if (dividaAtual + total > limiteCredito) {
        throw new Error("Venda bloqueada: ultrapassa o limite de crédito total do cliente.");
      }
      t.update(caRef, {
        currentDebt: admin.firestore.FieldValue.increment(total),
        weeklySpent: admin.firestore.FieldValue.increment(total),
        transactions: admin.firestore.FieldValue.arrayUnion({
          type: "debt",
          amount: total,
          orderId,
          timestamp: admin.firestore.Timestamp.now(),
        }),
      });
    }

    debitarEstoque(t, itensComPreco);

let walletBalanceBefore, walletBalanceAfter;
    if (userData) {
      walletBalanceBefore = arredondar(Number(userData.walletBalance || 0));
      walletBalanceAfter = walletPortion > 0
        ? arredondar(Number(userData.walletBalance || 0) - walletPortion)
        : walletBalanceBefore;
    }
    if (walletPortion > 0 && userData) {
      t.update(db.collection("users").doc(targetUserId), {
        walletBalance: walletBalanceAfter,
        weeklySpent: arredondar((userData.weeklySpent || 0) + walletPortion),
      });
      await registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
        userId: targetUserId,
        inmateCpf: cleanCpf(userData.inmateCpf || userData.prisonerCpf || userData.cpf || ""),
        amount: -walletPortion,
        proofUrl: "",
        status: "approved",
        createdAt: new Date().toISOString(),
        type: "withdrawal",
        description: "Compra PDV Administrativo",
        payerName: caller.name || "Administrador",
        payerId: caller.id,
      });
    }

    if (cashPortion > 0 && sessaoCaixa) {
      if (change !== undefined && (change < 0 || change > cashPortion)) {
        throw new Error("Troco inválido (deve estar entre 0 e o valor pago em dinheiro).");
      }
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

    const novoPedido = {
      id: orderId,
      userId: targetUserId,
      userName: isConsumer ? "CONSUMIDOR FINAL" : (userData?.name || clienteFiadoNome || "Consumidor"),
      userCpf: isConsumer ? "000.000.000-00" : (userData?.cpf || "000.000.000-00"),
      unitId: isConsumer ? "1" : (userData?.selectedUnitId || userData?.unitId || "1"),
      unitName: "Unidade Prisional",
      status: "paid",
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      items: itensComPreco,
      total,
      paymentMethod,
      ...(paymentMethod === "MIXED" ? { payments } : {}),
      ...(change !== undefined && (paymentMethod === "MIXED" || paymentMethod === "CASH") ? { change } : {}),
      inmateName: isConsumer ? "CONSUMIDOR FINAL" : (userData?.inmateName || userData?.prisonerName || "NÃO INFORMADO"),
      inmateCpf: isConsumer ? "000.000.000-00" : (userData?.inmateCpf || userData?.prisonerCpf || "000.000.000-00"),
      operatorName: caller.name || "ADMIN",
      operatorId: caller.id,
      ...pixConfirmacao,
      ...(walletBalanceBefore !== undefined ? { walletBalanceBefore } : {}),
      ...(walletBalanceAfter !== undefined ? { walletBalanceAfter } : {}),
      ...(paymentMethod === "FIADO" && customerAccountId ? { customerAccountId } : {}),
    };

    t.set(db.collection("orders").doc(orderId), novoPedido);
    // Idempotência: grava a marca do token apontando para o pedido criado.
    marcarIdempotenciaVenda(t, lerClientToken(request.data), caller.id, orderId);
    return novoPedido;
  });
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message || "Falha ao processar a venda.");
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
      const limite = Number(cfg.weeklyWalletLimit) || 300;
      if (arredondar(Number(ud.weeklySpent || 0) + total) > limite) {
        throw new Error(`Limite semanal excedido. Disponível: R$ ${arredondar(limite - Number(ud.weeklySpent || 0)).toFixed(2)}`);
      }
    }

    debitarEstoque(t, itensComPreco);

    const novoSaldo = arredondar(Number(ud.walletBalance || 0) - total);
    const novoWeekly = arredondar(Number(ud.weeklySpent || 0) + total);
    t.update(db.collection("users").doc(user.id), { walletBalance: novoSaldo, weeklySpent: novoWeekly });
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
    throw new HttpsError("invalid-argument", e.message || "Falha ao processar a compra.");
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
  const itens = validarItens(request.data?.items);
  const paymentProofUrl = String(request.data?.paymentProofUrl || "").trim().slice(0, 500000);
  const inmateLocation = request.data?.inmateLocation || null;
  const deliveryLocation = request.data?.deliveryLocation || inmateLocation || null;

  if (!paymentProofUrl) {
    throw new HttpsError("invalid-argument", "Envie o comprovante do PIX antes de confirmar o pedido.");
  }
  // Comprovante pendente (upload offline, será reenviado pelo app) ou URL do Storage.
  // A URL precisa pertencer ao bucket do projeto E à pasta do próprio usuário
  // (comprovante de outro usuário/projeto não pode ser usado para confirmar um pedido).
  if (paymentProofUrl !== "PENDENTE_UPLOAD_LOCAL_CACHE" && !(await comprovanteEhDoUsuario(paymentProofUrl, user, "comprovantes_pix"))) {
    throw new HttpsError("invalid-argument", "Comprovante inválido. Envie a imagem do comprovante pelo aplicativo.");
  }

const orderId = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase() : Math.random().toString(36).slice(2, 14)).toUpperCase();
  const clientToken = lerClientToken(request.data);
  let resultado;
  try {
    resultado = await db.runTransaction(async (t) => {
      const guarda = await verificarIdempotenciaVenda(t, clientToken, user.id);
      if (guarda) return { ...guarda.order, replay: true };
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
    throw new HttpsError("invalid-argument", e.message || "Falha ao registrar o pedido.");
  }

  return { ok: true, order: resultado };
});

/** Admin ─ aprova pedido PIX de forma atômica e auditada.
 *  - Valida que o pedido ainda está pendente e possui comprovante anexado
 *    (mesma proteção do aprovarDeposito — nunca aprova sem evidência).
 *  - Com finalizar=true, aprova E finaliza a compra em um único passo.
 *  - Registra auditoria e notifica o usuário que fez o pedido.
 */
exports.aprovarPedidoPix = onCall(async (request) => {
  const caller = await exigirAdmin(request);
  const orderId = String(request.data?.orderId || "").trim();
  const finalizar = request.data?.finalizar === true;
  if (!orderId) throw new HttpsError("invalid-argument", "Pedido inválido.");

  let statusFinal = "";
  let usuarioId = "";
  try {
    statusFinal = await db.runTransaction(async (t) => {
      const oRef = db.collection("orders").doc(orderId);
      const oSnap = await t.get(oRef);
      if (!oSnap.exists) throw new Error("Pedido não encontrado.");
      const pedido = oSnap.data();
      const st = String(pedido.status || "").toLowerCase();
      if (!["pending", "pendente", "pago_pendente", "pending_payment"].includes(st)) {
        throw new Error("Este pedido já foi processado (status atual: " + pedido.status + ").");
      }
      const ehCarteira = String(pedido.paymentMethod || "").toUpperCase() === "WALLET";
      if (!ehCarteira) {
        const proof = String(pedido.paymentProofUrl || "").trim();
        if (!proof || proof === "PENDENTE_UPLOAD_LOCAL_CACHE") {
          throw new Error("Pedido sem comprovante de pagamento. Anexe o comprovante antes de aprovar.");
        }
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
      usuarioId = String(pedido.userId || "");
      return atualizacao.status;
    });
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message || "Falha ao aprovar o pedido.");
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

/** Admin — estorno/devolução de pedido com carteira. */
exports.estornarVenda = onCall(async (request) => {
  const caller = await exigirAdmin(request);
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
      if (statusAtual.startsWith("CANCEL") || statusAtual === "REFUNDED" || statusAtual === "RETURNED") {
        throw new Error("Este pedido já foi cancelado/devolvido.");
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
      const ehFiado = pedido.paymentMethod === "FIADO";
      const caRef = ehFiado && pedido.customerAccountId
        ? db.collection("customer_accounts").doc(pedido.customerAccountId)
        : null;
      const caSnap = caRef ? await t.get(caRef) : null;

      itens.forEach((item, idx) => {
        if (snaps[idx].exists) {
          const freshStock = snaps[idx].data().stock || 0;
          t.update(snaps[idx].ref, { stock: freshStock + (Number(item.quantity) || 0) });
        }
      });

      if (uRef && uSnap && uSnap.exists) {
        const ud = uSnap.data();
        const uWalletPortion = pedido.paymentMethod === "WALLET"
          ? (Number(pedido.total) || 0)
          : (pedido.payments || []).filter((p) => p.method === "WALLET").reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const novoSaldo = arredondar(Number(ud.walletBalance || 0) + uWalletPortion);
        const novoWeekly = Math.max(0, arredondar((ud.weeklySpent || 0) - uWalletPortion));
        t.update(uRef, { walletBalance: novoSaldo, weeklySpent: novoWeekly });
        registrarTransacaoCarteira(t, db.collection("wallet_transactions").doc(), {
          userId: pedido.userId,
          inmateCpf: cleanCpf(ud.inmateCpf || ud.prisonerCpf || ud.cpf || ""),
          amount: uWalletPortion,
          proofUrl: "",
          status: "approved",
          createdAt: new Date().toISOString(),
          type: "correction",
          description: `Estorno Pedido #${String(orderId).slice(0, 6)}: ${motivo}`,
          payerName: caller.name || "Administrador",
          payerId: caller.id,
        });
      }

      // FIADO: reverte a dívida gravada no servidor (vendas novas); as antigas sem customerAccountId são ignoradas
      if (caRef && caSnap && caSnap.exists) {
        const conta = caSnap.data();
        const valorTotal = Number(pedido.total) || 0;
        t.update(caRef, {
          currentDebt: Math.max(0, arredondar((Number(conta.currentDebt) || 0) - valorTotal)),
          weeklySpent: Math.max(0, arredondar((Number(conta.weeklySpent) || 0) - valorTotal)),
          transactions: admin.firestore.FieldValue.arrayUnion({
            type: "reversal",
            amount: valorTotal,
            orderId,
            timestamp: admin.firestore.Timestamp.now(),
          }),
        });
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
    throw new HttpsError("invalid-argument", e.message || "Falha ao estornar o pedido.");
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
  const caller = await exigirAdmin(request);
  const customerAccountId = String(request.data?.customerAccountId || "").trim();
  const amount = arredondar(Number(request.data?.amount) || 0);
  const note = String(request.data?.note || "").trim().slice(0, 120);

  if (!customerAccountId) throw new HttpsError("invalid-argument", "Cliente de fiado não informado.");
  if (!(amount > 0)) throw new HttpsError("invalid-argument", "Valor do pagamento deve ser maior que zero.");

  const clienteRef = db.collection("customer_accounts").doc(customerAccountId);

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

      t.update(clienteRef, {
        currentDebt: novoDebito,
        transactions: admin.firestore.FieldValue.arrayUnion({
          type: "payment",
          amount,
          note,
          timestamp: admin.firestore.Timestamp.now(),
          by: caller.id,
          byName: caller.name || "Administrador",
        }),
      });

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
    throw new HttpsError("invalid-argument", e.message || "Falha ao registrar o pagamento.");
  }

  await registrarAudit(caller.id, "PAGAR_CONTA_FIADO", { clienteId: customerAccountId, amount }, resultado);

  return { ok: true, ...resultado };
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

  // Contas de fiado também têm cota semanal — zera junto (antes ficava acumulado)
  let totalZeradosFiado = 0;
  let snapshotFiado = await db.collection("customer_accounts").where("weeklySpent", ">", 0).limit(500).get();
  while (!snapshotFiado.empty && totalZeradosFiado < 5000) {
    const batchFiado = db.batch();
    snapshotFiado.docs.forEach((d) => batchFiado.update(d.ref, { weeklySpent: 0 }));
    await batchFiado.commit();
    totalZeradosFiado += snapshotFiado.size;
    snapshotFiado = await db.collection("customer_accounts").where("weeklySpent", ">", 0).limit(500).get();
  }
  if (totalZerados + totalZeradosFiado > 0) {
    logger.info(`[WeeklyReset] ${totalZerados} usuários e ${totalZeradosFiado} contas de fiado com cota zerada.`);
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
        .limit(500)
        .get();
      let lote = 0;
      while (!pagina.empty && lote < 8 && totalArchived < 4000) {
        const loteDocs = pagina.docs.filter((doc) => {
          if (!col.skipPendentes) return true;
          const d = doc.data();
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
  await exigirAdmin(request);
  const nova = String(request.data?.senha || "");
  if (nova.length < 4) {
    throw new HttpsError("invalid-argument", "A senha mestra deve ter pelo menos 4 caracteres.");
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
  if (user.role !== "admin") {
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
  const chamador = await exigirAdmin(request);
  const dias = Math.max(30, Math.min(730, Math.floor(Number(request.data?.dias) || 90)));
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const colecoes = [
    { name: "orders", dateField: "createdAt", skipPendentes: true },
    { name: "wallet_transactions", dateField: "createdAt", skipPendentes: true },
    { name: "expenses", dateField: "date", skipPendentes: false },
  ];

  const backup = { geradoEm: new Date().toISOString(), dias, por: chamador.name || chamador.id, dados: {} };
  const totais = {};
  let totalApagados = 0;

  for (const col of colecoes) {
    totais[col.name] = 0;
    backup.dados[col.name] = [];
    let pagina = await db.collection(col.name)
      .where(col.dateField, "<=", cutoff)
      .limit(500)
      .get();
    let lote = 0;
    // Limites de segurança: máx 4000 docs/coleção por execução, 8 lotes de 500.
    while (!pagina.empty && lote < 8 && backup.dados[col.name].length < 4000) {
      const loteDocs = pagina.docs.filter((d) => {
        if (!col.skipPendentes) return true;
        return String(d.data().status || "").toLowerCase() !== "pending";
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
      }
      lote++;
      if (backup.dados[col.name].length < 4000) {
        pagina = await db.collection(col.name)
          .where(col.dateField, "<=", cutoff)
          .limit(500)
          .get();
      }
    }
  }

  if (totalApagados === 0) {
    return { ok: true, total: 0, porColecao: totais, backupUrl: "", mensagem: "Nenhum dado antigo encontrado dentro do período." };
  }

  // 3) Backup físico em Storage (cópia de segurança independente do Firestore)
  let backupUrl = "";
  try {
    const bucket = admin.storage().bucket();
    const nomeArquivo = `backups/limpeza-${Date.now()}.json`;
    await bucket.file(nomeArquivo).save(JSON.stringify(backup), {
      contentType: "application/json",
      resumable: false,
    });
    const [url] = await bucket.file(nomeArquivo).getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    backupUrl = url;
  } catch (e) {
    logger.warn("[LimpezaCota] Falha ao salvar backup no Storage (o histórico no Firestore já preserva tudo):", e.message);
  }

  await db.collection("settings").doc("maintenance").set({
    lastCotaCleanup: new Date().toISOString(),
    lastCotaCleanupBy: chamador.id,
    lastCotaCleanupDias: dias,
  }, { merge: true });

  return { ok: true, total: totalApagados, porColecao: totais, backupUrl, mensagem: "" };
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

  const bucket = admin.storage().bucket();
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
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        responseDisposition: `attachment; filename="${path.basename(app.arquivo)}"`,
      });
      resultado.push({ chave: app.chave, nome: app.nome, descricao: app.descricao, disponivel: true, url, motivo: "" });
    } catch (e) {
      logger.warn("[DownloadApp] Falha ao gerar link de " + app.chave + ":", e.message);
      resultado.push({ chave: app.chave, nome: app.nome, descricao: app.descricao, disponivel: false, url: "", motivo: "erro_servidor" });
    }
  }

  return { ok: true, ehAdmin, apps: resultado, versao: "1.0.0" };
});




