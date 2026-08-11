import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  arrayUnion,
  increment,
  Timestamp,
  query,
  orderBy
} from "firebase/firestore";
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
export async function receiveCustomerPayment(customerId: string, amount: number, sessionId?: string) {
  try {
    const customerRef = doc(db, COLLECTION, customerId);

    await updateDoc(customerRef, {
      currentDebt: increment(-Number(amount)),
      transactions: arrayUnion({
        type: "payment",
        amount: Number(amount),
        timestamp: Timestamp.now()
      })
    });

    if (sessionId) {
      const sessionRef = doc(db, "cash_sessions", sessionId);
      await updateDoc(sessionRef, {
        currentBalance: increment(Number(amount)),
        supplements: arrayUnion({
          amount: Number(amount),
          reason: `Recebimento de Fiado - Cliente ID: ${customerId}`,
          timestamp: Timestamp.now()
        })
      });
    }
  } catch (e: any) {
    console.error("[receiveCustomerPayment]", e.message);
    throw new Error("Erro ao processar pagamento.");
  }
}
