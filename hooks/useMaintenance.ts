import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from '../types';

export interface MaintenanceState {
  ativo: boolean;
  motivo?: string;
  desativadoPor?: string;
  desativadoPorNome?: string;
  desativadoEm?: string;
}

const ATIVO: MaintenanceState = { ativo: true };

/** Identifica o master principal (mesma regra usada no AdminDashboard). */
export function isMasterUser(user?: User | null): boolean {
  if (!user) return false;
  return user.id === 'master' || user.id === 'admin'
    || (user as any).mainAdmin === true
    || user.email === 'admin@mercado.com';
}

/**
 * Observa o documento settings/maintenance em tempo real.
 * - admin comum: fica bloqueado quando o sistema está inativo
 * - quem desativou / master: mantém acesso e pode reativar
 * - usuários comuns NÃO usam este hook (nunca são bloqueados)
 */
export function useMaintenance(user?: User | null) {
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMaintenance(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ref = doc(db, 'settings', 'maintenance');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (cancelled) return;
        setMaintenance(snap.exists() ? (snap.data() as MaintenanceState) : null);
        setLoading(false);
      },
      () => {
        if (!cancelled) { setMaintenance(null); setLoading(false); }
      }
    );
    return () => { cancelled = true; unsub(); };
  }, [user?.id]);

  const inativo = maintenance !== null && maintenance.ativo === false;
  const desativadoPorMim = !!inativo && maintenance?.desativadoPor === user?.id;
  const podeOperar = !inativo || desativadoPorMim || isMasterUser(user);

  const desativar = useCallback(async (motivo?: string) => {
    if (!user) return;
    await setDoc(doc(db, 'settings', 'maintenance'), {
      ativo: false,
      motivo: motivo?.trim() || '',
      desativadoPor: user.id,
      desativadoPorNome: user.name || user.email,
      desativadoEm: new Date().toISOString(),
    });
  }, [user]);

  const reativar = useCallback(async () => {
    await setDoc(doc(db, 'settings', 'maintenance'), { ativo: true });
  }, []);

  return { maintenance: maintenance || ATIVO, loading, inativo, desativadoPorMim, podeOperar, desativar, reativar };
}
