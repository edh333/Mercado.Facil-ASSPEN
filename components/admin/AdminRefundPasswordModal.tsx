import React from 'react';
import { RefreshCw, XCircle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { RefundPasswordPanel } from './RefundPasswordPanel';
import { Order } from '../../types';

interface AdminRefundPasswordModalProps {
  isOpen: boolean;
  acao: 'estorno' | 'cancelar' | null;
  order: Order | null;
  exigirSenha: boolean;
  processando: boolean;
  erro: string;
  onClose: () => void;
  onConfirm: (motivo: string, senha: string) => void;
}

const TITULO: Record<'estorno' | 'cancelar', string> = {
  estorno: 'Estornar Pedido',
  cancelar: 'Cancelar Venda',
};

/**
 * CONFIRMAÇÃO PROFISSIONAL COM SENHA DO ADMIN para operações financeiras
 * irreversíveis (estorno/cancelamento). Faixada fino sobre o RefundPasswordPanel
 * + ModalShell por TOM SEMÂNTICO (estorno = âmbar, cancelar = vermelho).
 * Revalidar a senha é responsabilidade do chamador.
 */
export const AdminRefundPasswordModal: React.FC<AdminRefundPasswordModalProps> = ({
  isOpen, acao, order, exigirSenha, processando, erro, onClose, onConfirm
}) => {
  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      closeOnBackdrop={!processando}
      tone={acao === 'cancelar' ? 'danger' : 'warning'}
      title={acao ? TITULO[acao] : 'Confirmação'}
      subtitle={order ? `Pedido #${(order.id || '').slice(0, 8).toUpperCase()}` : ''}
      icon={acao === 'cancelar' ? <XCircle size={22} /> : <RefreshCw size={22} />}
      size="md"
    >
      <RefundPasswordPanel
        acao={acao || 'estorno'}
        order={order}
        exigirSenha={exigirSenha}
        processando={processando}
        erro={erro}
        onCancel={onClose}
        onConfirm={onConfirm}
      />
    </ModalShell>
  );
};

export default AdminRefundPasswordModal;