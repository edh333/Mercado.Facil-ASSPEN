import React from 'react';
import { Printer, FileText } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { ComprovanteAlvara, imprimirComprovanteAlvaraCupom, imprimirComprovanteAlvaraA4 } from '../../utils/printUtils';

interface ComprovanteAlvaraModalProps {
    /** Comprovante(s) já emitido(s) pelo servidor. `null` mantém o modal fechado. */
    comprovantes: ComprovanteAlvara[] | null;
    settings?: any;
    onClose: () => void;
}

/**
 * RECIBO DA DEVOLUÇÃO — escolha do formato de impressão.
 * Aparece depois que a devolução por alvará foi registrada (saldo já zerado no
 * servidor). O operador decide imprimir em bobina 80mm (cupom) ou folha A4 —
 * ambos os comprovantes declaram o reembolso via PIX.
 */
export const ComprovanteAlvaraModal: React.FC<ComprovanteAlvaraModalProps> = ({ comprovantes, settings, onClose }) => {
    const lista = comprovantes || [];
    const aberto = lista.length > 0;

    return (
        <ModalShell
            open={aberto}
            onClose={onClose}
            title="Recibo da Devolução"
            subtitle="Saldo zerado — escolha o formato de impressão"
            tone="success"
            size="sm"
            icon={<Printer size={20} />}
            footer={
                <div className="flex flex-col sm:flex-row justify-end items-center gap-3 bg-slate-50 border-t border-slate-100 px-6 py-4 mt-6 w-full md:w-auto">
                    <button type="button" onClick={onClose}
                        className="w-full sm:w-auto h-11 px-6 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors">
                        Fechar
                    </button>
                </div>
            }
        >
            <div className="p-5 space-y-5">
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                    A devolução via PIX foi registrada e o saldo foi zerado. Selecione o formato do recibo:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => { imprimirComprovanteAlvaraCupom(lista); onClose(); }}
                        className="h-14 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
                    >
                        <Printer size={18} />
                        Cupom (80mm)
                    </button>
                    <button
                        type="button"
                        onClick={() => { imprimirComprovanteAlvaraA4(lista, settings); onClose(); }}
                        className="h-14 rounded-xl bg-brand hover:bg-brand-dark text-white font-black text-[10px] uppercase tracking-widest flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-md shadow-emerald-600/10"
                    >
                        <FileText size={18} />
                        Folha A4
                    </button>
                </div>
            </div>
        </ModalShell>
    );
};

export default ComprovanteAlvaraModal;
