import React, { useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const NotificationSystem: React.FC = () => {
    const { notifications, removeNotification } = useApp();

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
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const icons = {
        success: <CheckCircle className="text-emerald-500" size={20} />,
        error: <AlertCircle className="text-red-500" size={20} />,
        warning: <AlertCircle className="text-amber-500" size={20} />,
        info: <Info className="text-blue-500" size={20} />
    };

    const colors = {
        success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
        error: 'border-red-100 bg-red-50 text-red-900',
        warning: 'border-amber-100 bg-amber-50 text-amber-900',
        info: 'border-blue-100 bg-blue-50 text-blue-900'
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } }}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-xl backdrop-blur-md ${colors[notification.type]}`}
        >
            <div className="mt-0.5 flex-shrink-0">
                {icons[notification.type]}
            </div>
            <div className="flex-1">
                <p className="text-sm font-bold leading-tight">{notification.message}</p>
            </div>
            <button 
                onClick={onClose}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
                <X size={16} />
            </button>
        </motion.div>
    );
};
