import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  arrayUnion,
  increment,
  Timestamp,
  orderBy,
  limit
} from "firebase/firestore";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CashMovement {
  amount: number;
  reason: string;
  timestamp: Timestamp;
}

export interface CashSession {
  id: string;
  operatorId: string;
  operatorName?: string;
  status: "open" | "closed";
  openedAt: Timestamp;
  closedAt: Timestamp | null;
  initialBalance: number;
  currentBalance: number;
  supplements: CashMovement[];
  withdrawals: CashMovement[];
  closedBalance: number;
  /** Difference: closedBalance - currentBalance. Negative = shortage. */
  balanceDiff?: number;
  /** What the system expected (snapshot at close time). */
  expectedBalance?: number;
  /** Difference: closedBalance - expectedBalance (same as balanceDiff). */
  cashDifference?: number;
  /** Quick flag: true when cashDifference !== 0. */
  hasDiscrepancy?: boolean;
  /** True quando fechada automaticamente pelo servidor (sessão abandonada). */
  autoClosed?: boolean;
}

// ──────────────────────────────────────────────
// 1. Open Cash Session
// ──────────────────────────────────────────────

/**
 * Opens a new cash session for an operator.
 * Throws if there is already an open session for this operator.
 */
export async function openCashSession(
  operatorId: string,
  operatorName: string,
  initialBalance: number
): Promise<string> {
  try {
    // Gaveta não nasce negativa: NaN/negativo contaminaria suprimentos,
    // sangrias e a quebra de caixa do dia inteiro. Zero é permitido.
    const inicial = Number(initialBalance);
    if (isNaN(inicial) || !(inicial >= 0)) {
      throw new Error("Saldo inicial deve ser zero ou positivo.");
    }
    // Guard: only one open session per operator
    const q = query(
      collection(db, "cash_sessions"),
      where("operatorId", "==", operatorId),
      where("status", "==", "open")
    );
    const activeSession = await getDocs(q);

    if (!activeSession.empty) {
      throw new Error("Já existe um caixa aberto para este operador.");
    }

    const newSession: Omit<CashSession, "id"> = {
      operatorId,
      operatorName,
      status: "open",
      openedAt: Timestamp.now(),
      closedAt: null,
      initialBalance: inicial,
      currentBalance: inicial,
      supplements: [],
      withdrawals: [],
      closedBalance: 0,
    };

    const docRef = await addDoc(collection(db, "cash_sessions"), newSession);
    return docRef.id;
  } catch (e: any) {
    console.error("[openCashSession]", e.message);
    throw e;
  }
}

// ──────────────────────────────────────────────
// 2. Add Supplement (Suprimento)
// ──────────────────────────────────────────────

/**
 * Adds cash to the till (e.g., change for customers, extra float).
 */
export async function addSupplement(
  sessionId: string,
  amount: number,
  reason: string
): Promise<void> {
  try {
    if (!(Number(amount) > 0)) {
      throw new Error("Valor de suprimento deve ser maior que zero.");
    }
    const sessionRef = doc(db, "cash_sessions", sessionId);
    await updateDoc(sessionRef, {
      currentBalance: increment(Number(amount)),
      supplements: arrayUnion({
        amount: Number(amount),
        reason,
        timestamp: Timestamp.now(),
      }),
    });
  } catch (e: any) {
    console.error("[addSupplement]", e.message);
    throw new Error("Erro ao registrar suprimento.");
  }
}

// ──────────────────────────────────────────────
// 3. Add Withdrawal (Sangria de Segurança)
// ──────────────────────────────────────────────

/**
 * Removes cash from the till (e.g., safe drop, expense payment).
 */
export async function addWithdrawal(
  sessionId: string,
  amount: number,
  reason: string
): Promise<void> {
  try {
    if (!(Number(amount) > 0)) {
      throw new Error("Valor de sangria deve ser maior que zero.");
    }
    const sessionRef = doc(db, "cash_sessions", sessionId);
    await updateDoc(sessionRef, {
      currentBalance: increment(-Number(amount)),
      withdrawals: arrayUnion({
        amount: Number(amount),
        reason,
        timestamp: Timestamp.now(),
      }),
    });
  } catch (e: any) {
    console.error("[addWithdrawal]", e.message);
    throw new Error("Erro ao registrar sangria.");
  }
}

// ──────────────────────────────────────────────
// 4. Close Cash Session with Audit
// ──────────────────────────────────────────────

/**
 * Closes the cash session and records the physical counted balance.
 * Calculates the difference (cashDifference / balanceDiff) for the audit trail.
 * Sets hasDiscrepancy flag for quick reporting.
 */
export async function closeCashSession(
  sessionId: string,
  closedBalance: number
): Promise<{ diff: number; expected: number }> {
  try {
    // Contagem física negativa não existe — registraria "sobra" absurda
    // no relatório de auditoria de quebra de caixa.
    const contado = Number(closedBalance);
    if (isNaN(contado) || !(contado >= 0)) {
      throw new Error("Valor contado deve ser zero ou positivo.");
    }
    const sessionRef = doc(db, "cash_sessions", sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      throw new Error("Sessão de caixa não encontrada.");
    }

    const data = sessionSnap.data() as CashSession;
    const expected = data.currentBalance;
    const diff = contado - expected;

    await updateDoc(sessionRef, {
      status: "closed",
      closedAt: Timestamp.now(),
      closedBalance: contado,
      expectedBalance: Number(expected),
      cashDifference: diff,
      balanceDiff: diff,
      hasDiscrepancy: diff !== 0,
    });

    return { diff, expected };
  } catch (e: any) {
    console.error("[closeCashSession]", e.message);
    throw new Error("Erro ao fechar sessão de caixa.");
  }
}

// ──────────────────────────────────────────────
// 5. Get Active Session for Operator
// ──────────────────────────────────────────────

/**
 * Returns the currently open cash session for the given operator, or null.
 */
export async function getActiveSession(
  operatorId: string
): Promise<CashSession | null> {
  try {
    const q = query(
      collection(db, "cash_sessions"),
      where("operatorId", "==", operatorId),
      where("status", "==", "open"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as Omit<CashSession, "id">) };
  } catch (e: any) {
    console.error("[getActiveSession]", e.message);
    return null;
  }
}

// ──────────────────────────────────────────────
// 6. Get Recent Sessions (for admin history)
// ──────────────────────────────────────────────

/**
 * Returns the last 20 sessions, ordered by open date descending.
 */
export async function getRecentSessions(maxSessions = 20): Promise<CashSession[]> {
  try {
    const q = query(
      collection(db, "cash_sessions"),
      orderBy("openedAt", "desc"),
      limit(maxSessions)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CashSession, "id">) }));
  } catch (e: any) {
    console.error("[getRecentSessions]", e.message);
    return [];
  }
}

// ──────────────────────────────────────────────
// 7. Get Discrepancies Report (Auditoria de Quebra de Caixa)
// ──────────────────────────────────────────────

/**
 * Returns all closed sessions that had a discrepancy (difference !== 0).
 * Ordered by close date descending. Useful for audit reports.
 */
export async function getCashDiscrepanciesReport(): Promise<{
  id: string;
  operador: string;
  operadorNome?: string;
  dataFechamento: string;
  esperado: number;
  contado: number;
  diferenca: number;
}[]> {
  try {
    const q = query(
      collection(db, "cash_sessions"),
      where("hasDiscrepancy", "==", true),
      orderBy("closedAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        operador: d.operatorId,
        operadorNome: d.operatorName,
        dataFechamento: d.closedAt?.toDate().toLocaleDateString("pt-BR") || "—",
        esperado: d.expectedBalance ?? d.currentBalance ?? 0,
        contado: d.closedBalance ?? 0,
        diferenca: d.cashDifference ?? d.balanceDiff ?? 0,
      };
    });
  } catch (e: any) {
    console.error("[getCashDiscrepanciesReport]", e.message);
    return [];
  }
}
