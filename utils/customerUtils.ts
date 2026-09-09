import { db } from "../firebase";
import {
  collection,
  addDoc,
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
  orderBy
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CustomerAccount } from "../types";

const COLLECTION = "customer_accounts";

export async function getCustomerAccounts(): Promise<CustomerAccount[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy("nome", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerAccount));
  } catch (e: any) {
    console.error("[getCustomerAccounts]", e.message);
    return [];
  }
}

export async function addCustomerAccount(data: Omit<CustomerAccount, "id" | "createdAt" | "transactions">): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      transactions: [],
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (e: any) {
    console.error("[addCustomerAccount]", e.message);
    throw new Error("Erro ao cadastrar cliente.");
  }
}

export async function updateCustomerAccount(id: string, data: Partial<CustomerAccount>): Promise<void> {
  try {
    const ref = doc(db, COLLECTION, id);
    await updateDoc(ref, data);
  } catch (e: any) {
    console.error("[updateCustomerAccount]", e.message);
    throw new Error("Erro ao atualizar cliente.");
  }
}

export async function deleteCustomerAccount(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (e: any) {
    console.error("[deleteCustomerAccount]", e.message);
    throw new Error("Erro ao excluir cliente.");
  }
}

// 1. Receber Pagamento de Conta (Cliente veio pagar o que deve)
// Preferência: Cloud Function `registrarPagamentoConta` (abatimento atômico no
// servidor, com validação de valor e clamp — nunca fica dívida negativa).
// Fallback local (quando a função ainda não foi publicada): mesmo comportamento,
// validando o valor e fazendo clamp, para não quebrar o fluxo de caixa do lojista.
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
    // Função não publicada (ou rede) → fallback local com as mesmas regras
  }

  try {
    const customerRef = doc(db, COLLECTION, customerId);
    // getDoc (antes: getDocs de TODA a coleção para achar 1 doc — N+1)
    const customerSnap = await getDoc(customerRef);
    if (!customerSnap.exists()) throw new Error("Conta de fiado não encontrada.");
    const conta = customerSnap.data();
    const dividaAtual = Math.round(Number(conta?.currentDebt || 0) * 100) / 100;
    if (dividaAtual <= 0) throw new Error("Este cliente não possui débito em aberto.");
    if (valor > dividaAtual) throw new Error(`O pagamento (R$ ${valor.toFixed(2)}) supera a dívida (R$ ${dividaAtual.toFixed(2)}). Abata no máximo o valor devido.`);

    const novoDebito = Math.round((dividaAtual - valor) * 100) / 100;

    // writeBatch: débito do cliente E caixa da sessão na MESMA transação —
    // antes eram dois updateDoc separados (se o 2º falhasse, a dívida abaixava
    // mas o caixa não recebia: discrepância financeira).
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
