import { useEffect, useCallback } from 'react';

interface UseShortcutsOptions {
  shortcutsModalOpen: boolean;
  goToTab: (tab: string) => void;
  hasPermission: (perm: string) => boolean;
  setShowSalesModal: (v: boolean) => void;
  setShowShortcutsModal: (v: boolean) => void;
  setShowReportModal: (v: boolean) => void;
  setShowProductModal: (v: boolean) => void;
}

export function useShortcuts({
  shortcutsModalOpen,
  goToTab,
  hasPermission,
  setShowSalesModal,
  setShowShortcutsModal,
  setShowReportModal,
  setShowProductModal,
}: UseShortcutsOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    const isFKey = /^F([1-9]|1[0-2])$/.test(e.key);
    if (!isFKey && !(e.key === '?')) return;
    if (shortcutsModalOpen) return;
    e.preventDefault();

    const key = e.key;
    if (key === '?') { setShowShortcutsModal(true); return; }

    const map: Record<string, () => void> = {
      F1: () => goToTab('home'),
      F2: () => { if (hasPermission('sales')) setShowSalesModal(true); },
      F3: () => goToTab('orders'),
      F4: () => goToTab('reports'),
      F5: () => goToTab('products'),
      F6: () => goToTab('finance'),
      F7: () => goToTab('wallet'),
      F8: () => goToTab('users'),
      F9: () => goToTab('bi'),
      F10: () => goToTab('settings'),
      F11: () => goToTab('cash'),
      F12: () => goToTab('customers'),
    };
    const action = map[e.key];
    if (action) action();
  }, [shortcutsModalOpen, goToTab, hasPermission, setShowSalesModal, setShowShortcutsModal, setShowReportModal, setShowProductModal]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}