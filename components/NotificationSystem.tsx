import React, { useEffect, useCallback } from 'react';
import { useApp } from '../context/StoreContext';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const NotificationSystem: React.FC = () => {
    const { notifications, removeNotification } = useApp();

    const handleRemove = useCallback((id: string) => {
        removeNotification(id);
    }, [removeNotification]);

    return (
        <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
            <AnimatePresence mode="popLayout">
                {notifications.map((notification) => (
                    <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onClose={() => removeNotification(notification.id)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};

interface NotificationItemProps {
    notification: {
        id: string;
        message: string;
        type: 'success' | 'error' | 'info' | 'warning';
    };
    onClose: () => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose }) => {
    const onCloseRef = React.useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const timer = setTimeout(() => onCloseRef.current(), 5000);
        return () => clearTimeout(timer);
    }, []);

    const icons = {
        success: <CheckCircle className="text-emerald-400" size={22} strokeWidth={3} />,
        error: <AlertCircle className="text-red-400" size={22} strokeWidth={3} />,
        warning: <AlertCircle className="text-amber-400" size={22} strokeWidth={3} />,
        info: <Info className="text-blue-400" size={22} strokeWidth={3} />
    };

    const colors = {
        success: 'border-emerald-500/50 bg-slate-900 text-white shadow-emerald-500/20',
        error: 'border-red-500/50 bg-slate-900 text-white shadow-red-500/20',
        warning: 'border-amber-500/50 bg-slate-900 text-white shadow-amber-500/20',
        info: 'border-blue-500/50 bg-slate-900 text-white shadow-blue-500/20'
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -20, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`pointer-events-auto flex items-start gap-4 p-5 rounded-[1.5rem] border-2 shadow-2xl backdrop-blur-xl ${colors[notification.type]} relative overflow-hidden`}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
            <div className="mt-0.5 flex-shrink-0 relative z-10">
                {icons[notification.type]}
            </div>
            <div className="flex-1 relative z-10">
                <p className="text-[13px] font-black uppercase tracking-tight leading-tight">{notification.message}</p>
                <div className="mt-2 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: '100%' }}
                        animate={{ width: 0 }}
                        transition={{ duration: 5, ease: "linear" }}
                        className={`h-full ${notification.type === 'success' ? 'bg-[var(--primary-color)]' : notification.type === 'error' ? 'bg-[var(--color-brand-red)]' : notification.type === 'warning' ? 'bg-[var(--color-brand-amber)]' : 'bg-[var(--primary-color)]'}`}
                    />
                </div>
            </div>
            <button
                onClick={onClose}
                className="flex-shrink-0 text-white/60 hover:text-white transition-all p-1 bg-white/5 hover:bg-white/10 rounded-lg relative z-10"
            >
                <X size={18} />
            </button>
        </motion.div>
    );
};

