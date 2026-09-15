import { db } from "../firebase";
import {
  collection,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  writeBatch,
  arrayUnion,
  increment,
  Timestamp,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CustomerAccount } from "../types";

// UNIFICADO (decisão do PDV): a "conta de fiado" NÃO é uma coleção paralela
// customer_accounts. O cliente de fiado É o usuário cadastrado (users/), no mesmo
// universo de PIX/WALLET/CASH/CARD/MIXED — dívida/limite/gasto vivem no doc do
// usuário. Este módulo é apenas uma CAMADA DE MAPEAMENTO: lê usuários e devolve
// no shape CustomerAccount que o front legado conhece (nome/cpf/telefone/...).
const COLLECTION = "users";

// Usuários aptos a fiado = os que o servidor autoriza:
// - allowCredit === true (limite de crédito configurado)   → "active"
// - currentDebt > 0 (tem dívida em aberto, mesmo sem allowCredit) → mantém
// - blocked apenas se o próprio usuário estiver com status blocked.
// Não usamos mais a flag "creditLimit no doc da conta" como gate: o servidor
// valida currentDebt + creditLimit atômicamente na venda.
export async function getCustomerAccounts(): Promise<CustomerAccount[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy("name", "asc"), limit(500));
    const snap = await getDocs(q);
    const list: CustomerAccount[] = [];
    snap.docs.forEach(d => {
      const u = d.data() as any;
      const allowCredit = u.allowCredit === true;
      const temDivida = Number(u.currentDebt || 0) > 0;
      if (!allowCredit && !temDivida) return; // só participantes ativos de fiado
      list.push({
        id: d.id,
        nome: String(u.name || u.nome || "Fiado").toUpperCase(),
        cpf: u.cpf || u.inmateCpf || u.prisonerCpf || "",
        telefone: u.phone || u.telefone || u.inmatePhone || "",
        creditLimit: Number(u.creditLimit || 0),
        currentDebt: Number(u.currentDebt || 0),
        weeklySpent: Number(u.weeklySpent || 0),
        status: String(u.status || "active").toLowerCase() === "blocked" ? "blocked" : "active",
        transactions: [],
        createdAt: u.createdAt || "",
        debtStartedAt: u.debtStartedAt || ""
      } as CustomerAccount);
    });
    return list;
  } catch (e: any) {
    console.error("[getCustomerAccounts]", e.message);
    return [];
  }
}

export async function addCustomerAccount(data: Omit<CustomerAccount, "id" | "createdAt" | "transactions">): Promise<string> {
  try {
    // Criação SEMPRE via Cloud Function (rules de users negam create direto —
    // allow create: if false). O servidor também valida CPF/limite e audita.
    const fn = httpsCallable(getFunctions(), 'criarClienteFiado');
    const res = await fn({
      nome: String(data.nome || "").toUpperCase(),
      cpf: data.cpf || "",
      telefone: data.telefone || "",
      creditLimit: Number(data.creditLimit || 0),
    });
    const resData = res.data as any;
    if (resData?.ok && resData.userId) return resData.userId;
    throw new Error("Resposta inválida do servidor.");
  } catch (e: any) {
    const code = e?.code || '';
    if (code && code !== 'functions/not-found' && code !== 'functions/internal' && code !== 'functions/unavailable') {
      throw new Error(e?.message || "Erro ao cadastrar usuário de fiado.");
    }
    console.error("[addCustomerAccount]", e.message);
    throw new Error("Erro ao cadastrar usuário de fiado. Verifique se as Cloud Functions estão publicadas (npm run deploy:functions).");
  }
}

export async function updateCustomerAccount(id: string, data: Partial<CustomerAccount>): Promise<void> {
  try {
    const ref = doc(db, COLLECTION, id);
    const payload: any = {};
    if (data.nome !== undefined) payload.name = String(data.nome || "").toUpperCase();
    if (data.cpf !== undefined) payload.cpf = data.cpf || "";
    if (data.telefone !== undefined) payload.phone = data.telefone || "";
    if (data.creditLimit !== undefined) payload.creditLimit = Number(data.creditLimit || 0);
    if (data.currentDebt !== undefined) payload.currentDebt = Math.max(0, Number(data.currentDebt || 0));
    if (data.status !== undefined) {
      payload.status = String(data.status || "active").toLowerCase() === "blocked" ? "blocked" : "active";
      payload.allowCredit = payload.status !== "blocked";
    }
    if (Object.keys(payload).length) await updateDoc(ref, payload);
  } catch (e: any) {
    console.error("[updateCustomerAccount]", e.message);
    throw new Error("Erro ao atualizar usuário de fiado.");
  }
}

export async function deleteCustomerAccount(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (e: any) {
    console.error("[deleteCustomerAccount]", e.message);
    throw new Error("Erro ao excluir usuário de fiado.");
  }
}

// 1. Receber Pagamento de Conta — abate a dívida NO SERVIDOR (atômico, clamp,
// nunca fica negativa). Fallback local apenas quando a função ainda não existe.
export async function receiveCustomerPayment(customerId: string, amount: number, sessionId?: string) {
  const valor = Math.round(Number(amount) * 100) / 100;
  if (!(valor > 0)) throw new Error("Valor do pagamento deve ser maior que zero.");

  try {
    const fn = httpsCallable(getFunctions(), 'registrarPagamentoConta');
    const res = await fn({ customerAccountId: customerId, amount: valor, sessionId: sessionId || null });
    const data = res.data as any;
    if (data?.ok) return data;
  } catch (e: any) {
    const code = e?.code || '';
    if (code && code !== 'functions/not-found' && code !== 'functions/internal' && code !== 'functions/unavailable') {
      throw new Error(e?.message || "Erro ao processar pagamento.");
    }
  }

  try {
    const customerRef = doc(db, COLLECTION, customerId);
    const customerSnap = await getDoc(customerRef);
    if (!customerSnap.exists()) throw new Error("Usuário de fiado não encontrado.");
    const conta = customerSnap.data() as any;
    const dividaAtual = Math.round(Number(conta?.currentDebt || 0) * 100) / 100;
    if (dividaAtual <= 0) throw new Error("Este cliente não possui débito em aberto.");
    if (valor > dividaAtual) throw new Error(`O pagamento (R$ ${valor.toFixed(2)}) supera a dívida (R$ ${dividaAtual.toFixed(2)}). Abate no máximo o valor devido.`);

    const novoDebito = Math.round((dividaAtual - valor) * 100) / 100;

    const batch = writeBatch(db);
    batch.update(customerRef, {
      currentDebt: novoDebito,
      transactions: arrayUnion({
        type: "payment",
        amount: valor,
        timestamp: Timestamp.now()
      })
    });

    if (sessionId) {
      const sessionRef = doc(db, "cash_sessions", sessionId);
      batch.update(sessionRef, {
        currentBalance: increment(valor),
        supplements: arrayUnion({
          amount: valor,
          reason: `Recebimento de Fiado - Cliente ID: ${customerId}`,
          timestamp: Timestamp.now()
        })
      });
    }

    await batch.commit();
    return { ok: true, dividaAnterior: dividaAtual, novoDebito };
  } catch (e: any) {
    console.error("[receiveCustomerPayment]", e.message);
    throw new Error(e?.message || "Erro ao processar pagamento.");
  }
}
