import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
                <div className="flex flex-col sm:flex-row justify-end items-center gap-3 bg-slate-50 border-t border-slate-100 px-6 py-4 mt-6 w-full md:w-auto">
                    <button type="button" onClick={onClose} disabled={processando}
                        className="w-full sm:w-auto h-11 px-6 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        Cancelar
                    </button>
                    <button type="button" onClick={onConfirm} disabled={!valido || processando}
                        className={`w-full sm:w-auto h-11 px-8 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2 ${
                            processando
                                ? 'bg-emerald-700 text-white/80 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10 cursor-pointer'
                        } ${!valido && !processando ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        {processando ? (<><Loader2 size={16} className="animate-spin" /> Processando...</>) : 'Confirmar'}
                    </button>
                </div>
            }
        >
            <div className="p-5 space-y-5">
                <p className="text-xs font-bold text-slate-500 leading-relaxed">{descricao}</p>

                {semDigitar ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-left mb-4">
                        <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                        <span className="text-amber-800 text-xs font-bold font-sans uppercase tracking-wider">
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
