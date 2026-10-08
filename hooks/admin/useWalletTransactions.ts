import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { WalletTransaction } from '../../types';
import { UserRole } from '../../types';

export function useWalletTransactions(currentUser: any) {
  const [walletTx, setWalletTx] = useState<WalletTransaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);

  const recarregarTransacoes = useCallback(async () => {
    if (currentUser?.role !== UserRole.ADMIN) {
      setLoadingWallet(false);
      return;
    }
    try {
      const q = query(collection(db, 'wallet_transactions'), orderBy('createdAt', 'desc'), limit(500));
      const snapshot = await getDocs(q);
      const txs: WalletTransaction[] = [];
      snapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() } as WalletTransaction);
      });
      setWalletTx(txs);
    } catch (e) {
      console.error('Erro ao recarregar transações da carteira:', e);
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role !== UserRole.ADMIN) {
      setLoadingWallet(false);
      return;
    }
    const q = query(collection(db, 'wallet_transactions'), orderBy('createdAt', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: WalletTransaction[] = [];
      snapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() } as WalletTransaction);
      });
      setWalletTx(txs);
      setLoadingWallet(false);
    }, (error) => {
      console.error('Erro ao escutar transações da carteira:', error);
      setLoadingWallet(false);
    });
    return () => unsubscribe();
  }, [currentUser?.role]);

  return { walletTx, loadingWallet, recarregarTransacoes };
}