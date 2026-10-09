import React from 'react';
import { Lock, ShieldCheck, Coins, ArrowUpRight, Smartphone, Store } from 'lucide-react';
import { formatarMoeda } from '../../utils';

interface StoreSuspendedScreenProps {
    /** Nome da instituição (settings.institutionName) — exibido no rodapé. */
    institutionName?: string;
    /** Saldo atual do usuário (currentUser.walletBalance). */
    saldo: number;
    /** Abre o modal de depósito PIX (mesmo handler do botão "Enviar Crédito"). */
    onSendCredit: () => void;
}

/**
 * Tela exibida quando o catálogo está suspenso (allow_user_purchases === false).
 * Substitui o antigo bloco vermelho: moderna, responsiva e — diferente do
 * layout anterior — mantém saldo e CTA de depósito visíveis também no MOBILE
 * (antes eles sumiam porque só existiam dentro da loja renderizada).
 */
export const StoreSuspendedScreen: React.FC<StoreSuspendedScreenProps> = ({
    institutionName,
    saldo,
    onSendCredit,
}) => {
    return (
        <div className="max-w-md mx-auto py-6 md:py-10 flex flex-col items-center">
            <div className="relative w-full bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/60 overflow-hidden">
                {/* Tarja superior */}
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />

                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-amber-50 border-2 border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                        <Lock size={28} strokeWidth={2.2} />
                    </div>

                    <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4">
                        <ShieldCheck size={11} /> Balanço interno em andamento
                    </span>

                    <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight mb-2 uppercase">
                        Catálogo Temporariamente Indisponível
                    </h2>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6 px-1">
                        No momento, o módulo de compras está fechado para atualizações ou balanço interno.
                        Você ainda pode adicionar saldo normalmente para futuras compras.
                    </p>

                    {/* Saldo atual — presente também no mobile */}
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between mb-4 text-left">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saldo Disponível</p>
                            <p className="text-lg font-black tracking-tight text-slate-900">
                                <span className="text-[11px] font-bold text-slate-400 mr-0.5">R$</span>
                                {formatarMoeda(saldo || 0)}
                            </p>
                        </div>
                        <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 uppercase tracking-wider">
                            Depósitos liberados
                        </span>
                    </div>

                    {/* CTA principal */}
                    <button
                        onClick={onSendCredit}
                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Coins size={15} /> + Enviar Crédito via PIX
                    </button>

                    {/* Instrução */}
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left mt-4">
                        <div className="flex gap-3">
                            <div className="mt-0.5 p-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600 shrink-0">
                                <ArrowUpRight size={15} />
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-1">Como proceder?</h4>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Toque em <strong className="text-slate-700 font-bold">"+ Enviar Crédito"</strong> acima
                                    (ou no botão do topo da página) para transferir valores via PIX para a custódia do interno.
                                    O saldo fica disponível assim que o pagamento for confirmado.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Rodapé */}
                <div className="pt-4 border-t border-slate-100 mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold">
                    <Smartphone size={13} /> Acesso liberado para depósitos e movimentações
                </div>
            </div>

            <p className="text-center text-[10px] text-slate-400 mt-4 font-bold flex items-center gap-1.5">
                <Store size={12} />
                {institutionName || 'Mercado Fácil'} • Sistema de Custódia Interna
            </p>
        </div>
    );
};

export default StoreSuspendedScreen;
