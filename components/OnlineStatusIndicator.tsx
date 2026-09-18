import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCcw, LogOut, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/StoreContext';

export const OnlineStatusIndicator: React.FC = () => {
    const { isOfflineUnlocked, logoutOffline } = useApp();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showStatus, setShowStatus] = useState(false);

    const emEmergencia = isOfflineUnlocked === true;

    useEffect(() => {
        if (emEmergencia) setShowStatus(true);
    }, [emEmergencia]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowStatus(true);
            setTimeout(() => setShowStatus(false), 3000); // Hide after 3s
        };

        const handleOffline = () => {
            setIsOnline(false);
            setShowStatus(true); // Always show when offline
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Se inicializar offline, mostra o status imediatamente
        if (!navigator.onLine) {
            setShowStatus(true);
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return (
        <AnimatePresence>
            {showStatus && (
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -50 }}
                    className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999]"
                >
                    {emEmergencia ? (
                        <div className="flex items-center gap-3 px-6 py-3 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl border border-red-500/40 bg-red-950/90">
                            <ShieldAlert size={18} className="animate-pulse text-red-400" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white leading-none">
                                    Emergência OFFLINE ativa
                                </span>
                                <span className="text-[10px] font-bold opacity-80 text-red-200">
                                    {isOnline ? 'Internet voltou — entre com sua conta para sincronizar' : 'Vendas vão para a fila local e sincronizam ao reconectar'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => logoutOffline()}
                                className="ml-2 flex items-center gap-1.5 rounded-full bg-red-500/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-red-500 active:scale-95 transition-all cursor-pointer"
                            >
                                <LogOut size={12} /> Sair
                            </button>
                        </div>
                    ) : (
                        <div className={`flex items-center gap-3 px-6 py-3 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl border ${
                            isOnline
                                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400'
                                : 'bg-amber-950/80 border-amber-500/30 text-amber-400'
                        }`}>
                            {isOnline ? (
                                <>
                                    <Wifi size={18} className="animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                                        Conectado / Sincronizado
                                    </span>
                                </>
                            ) : (
                                <>
                                    <WifiOff size={18} className="animate-pulse" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white leading-none">
                                            Modo Offline
                                        </span>
                                        <span className="text-[10px] font-bold opacity-70">
                                            Trabalhando com cache local
                                        </span>
                                    </div>
                                    <RefreshCcw size={14} className="opacity-50 ml-2" />
                                </>
                            )}
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
