import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';

interface ConfirmacaoDestrutivaProps {
    isOpen: boolean;
    titulo: string;
    descricao: string;
    /** Palavra que precisa ser digitada para habilitar o botão (padrão: ZERAR) */
    palavraChave?: string;
    /** Modo SEM digitação: confirmação em 2 toques (modal → Confirmar). Usado em
     *  fluxos de aprovação de alto volume (pedidos, créditos) onde o operador
     *  já conferiu o comprovante na tela. NUNCA usar em exclusão/zeramento. */
    semDigitar?: boolean;
    onConfirm: () => void;
    onClose: () => void;
    processando?: boolean;
}

/**
 * CONFIRMAÇÃO DIGITADA PARA OPERAÇÕES DESTRUTIVAS
 * Substitui o window.confirm nas ações irreversíveis (zerar financeiro,
 * créditos, estoque): o botão só habilita quando o operador digita a
 * palavra-chave — impossível acionar num deslize de clique.
 */
export const ConfirmacaoDestrutiva: React.FC<ConfirmacaoDestrutivaProps> = ({
    isOpen, titulo, descricao, palavraChave = 'ZERAR', semDigitar = false, onConfirm, onClose, processando = false
}) => {
    const [texto, setTexto] = useState('');
    const valido = semDigitar ? !processando : texto.trim().toUpperCase() === palavraChave.toUpperCase();

    useEffect(() => {
        if (isOpen) setTexto('');
    }, [isOpen]);

    return (
        <ModalShell
            open={isOpen}
            onClose={onClose}
            title={titulo}
            tone="danger"
            size="sm"
            icon={<AlertTriangle size={20} />}
            closeOnBackdrop={!processando}
            footer={
                <div className="flex gap-2 w-full">
                    <button type="button" onClick={onClose} disabled={processando}
                        className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-slate-200 hover:bg-slate-100 font-black text-[10px] uppercase tracking-[0.2em] text-slate-600 transition-all active:scale-95 disabled:opacity-40">
                        Cancelar
                    </button>
                    <button type="button" onClick={onConfirm} disabled={!valido || processando}
                        className="flex-1 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-md shadow-red-500/25">
                        {processando ? 'Processando…' : 'Confirmar'}
                    </button>
                </div>
            }
        >
            <div className="p-5 space-y-5">
                <p className="text-xs font-bold text-slate-500 leading-relaxed">{descricao}</p>

                {semDigitar ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                            Esta ação é irreversível. Confira os dados antes de confirmar.
                        </span>
                    </div>
                ) : (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-red-600 shrink-0">Digite</span>
                    <span className="px-3 py-1 rounded-lg bg-white border-2 border-dashed border-red-300 text-red-700 font-black text-sm tracking-[0.3em] tnum select-all">{palavraChave}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-red-600">para liberar</span>
                </div>
                )}

                {!semDigitar && (
                <input
                    type="text"
                    autoFocus
                    value={texto}
                    disabled={processando}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && valido && !processando) onConfirm(); }}
                    placeholder="••••••"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-red-500 p-4 rounded-2xl font-black text-center text-lg uppercase tracking-[0.3em] outline-none transition-colors disabled:opacity-50"
                />
                )}
            </div>
        </ModalShell>
    );
};

export default ConfirmacaoDestrutiva;
