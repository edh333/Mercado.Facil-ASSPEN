import React from 'react';
import { Product, User, AppConfig, Order } from '../../types';
import { TelaPDV } from './TelaPDV';

export interface AdminSalesModalSharedProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  products: Product[];
  orders?: Order[];
  onConfirm: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30'; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }, cardBrand?: string, fiado30UserId?: string, senhaPrimaria?: string, senhaSecundaria?: string, sessaoCaixaId?: string) => Promise<any>;
  onConfirmOffline?: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30'; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string, cardBrand?: string, sessaoCaixaId?: string) => Promise<any>;
  setPrintOrder?: (order: any) => void;
  settings?: AppConfig;
  currentUser?: User;
  theme?: any;
  primaryColor?: string;
}

export const AdminSalesModal: React.FC<AdminSalesModalSharedProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 min-h-screen w-full bg-slate-50 overflow-y-auto">
      <TelaPDV {...props} />
    </div>
  );
};
