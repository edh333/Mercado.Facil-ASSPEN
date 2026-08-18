import React from 'react';
import { Product, User, AppConfig, Order } from '../../types';
import { AdminSalesModalDefault } from './AdminSalesModalDefault';

export interface AdminSalesModalSharedProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  products: Product[];
  orders?: Order[];
  onConfirm: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string) => Promise<any>;
  onConfirmOffline?: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[], change?: number, customerAccountId?: string) => Promise<any>;
  setPrintOrder?: (order: any) => void;
  settings?: AppConfig;
  currentUser?: User;
  theme?: any;
  primaryColor?: string;
}

export const AdminSalesModal: React.FC<AdminSalesModalSharedProps> = (props) => {
  if (!props.isOpen) return null;
  return <AdminSalesModalDefault {...props} />;
};
