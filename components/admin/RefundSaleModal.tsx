import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, RotateCcw, Search, SearchX } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { RefundPasswordPanel } from './RefundPasswordPanel';
import { Order } from '../../types';
import { formatarMoeda } from '../../utils';
import { useApp } from '../../context/StoreContext';

/**
 * MODAL ÚNICO DE ESTORNO/CANCELAMENTO (usado no PDV e na aba Ordens):
 *  - Passo 1: busca por número/cliente/CPF — resultados da janela já carregada
 *    + busca SERVER-SIDE por pedidos antigos (paginação "carregar mais").
 *  - Passo 2: RefundPasswordPanel — resumo, motivo obrigatório e senha do
 *    admin (revalidada no servidor), com resultado final.
 * A segurança e a execução ficam NESTE modal; onAfterSuccess permite efeitos
 * colaterais (notificação do familiar, fechar a janela, etc.).
 */
interface RefundSaleModalProps {
  isOpen: boolean;
  acao?: 'estorno' | 'cancelar';
  initialOrder?: Order | null;
  ordersBase?: Order[];
  onClose: () => void;
  onAfterSuccess?: (order: Order, motivo: string) => void;
}

const ESTADO_TERMINAL = (o: any) => {
  const s = String(o?.status || '').toUpperCase();
  return s.startsWith('CANCEL') || ['REFUNDED', 'RETURNED', 'ESTORNADO', 'DEVOLVIDO', 'REEMBOLSADO', 'REJECTED', 'REJEITADO'].includes(s);
};

const combinaTermo = (o: any, term: string) => {
  if (!term) return true;
  const tCpf = term.replace(/\D/g, '');
  return (
    String(o.id || '').toLowerCase().includes(term) ||
    String(o.userName || '').toLowerCase().includes(term) ||
    String(o.inmateName || '').toLowerCase().includes(term) ||
    (tCpf && String(o.userCpf || '').replace(/\D/g, '').includes(tCpf))
  );
};

export const RefundSaleModal: React.FC<RefundSaleModalProps> = ({
  isOpen,
  acao = 'estorno',
  initialOrder,
  ordersBase = [],
  onClose,
  onAfterSuccess,
}) => {
  const { estornarPedido, buscarPedidosParaEstorno, validateMasterPassword, masterPasswordStatus, currentUser } = useApp();

  const [selected, setSelected] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [serverResults, setServerResults] = useState<Order[] | null>(null);
  const [serverLast, setServerLast] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverOffline, setServerOffline] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; message: string } | null>(null);
  const [senhaMestraDefinida, setSenhaMestraDefinida] = useState<boolean | null>(null);

  // PADRÃO SEGURO: exige senha para TODOS, exceto quando a senha mestra ainda
  // não foi configurada e o operador é o admin principal.
  useEffect(() => {
    if (!isOpen) return;
    let ativo = true;
    setSenhaMestraDefinida(null);
    masterPasswordStatus()
      .then((r: any) => { if (ativo) setSenhaMestraDefinida(r?.definida === true); })
      .catch(() => { if (ativo) setSenhaMestraDefinida(false); });
    return () => { ativo = false; };
  }, [isOpen, masterPasswordStatus]);

  const u = currentUser as any;
  const isMainAdmin = u?.mainAdmin === true || u?.id === 'master' || u?.id === 'admin' || u?.email === 'admin@mercado.com';
  const exigirSenha = senhaMestraDefinida === false ? !isMainAdmin : true;

  // Reset ao abrir
  useEffect(() => {
    if (!isOpen) return;
    setResultado(null);
    setProcessando(false);
    setServerResults(null);
    setServerLast('');
    setServerOffline(false);
    if (initialOrder) {
      setSelected(initialOrder);
      setSearch(String(initialOrder.id || '').slice(0, 12));
    } else {
      setSelected(null);
      setSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Resultados da janela já carregada
  const localResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = (ordersBase || []).filter(o => o && !ESTADO_TERMINAL(o));
    if (!term) return base.slice(0, 8);
    return base.filter(o => combinaTermo(o, term)).slice(0, 8);
  }, [ordersBase, search]);

  // Mescla locais + servidor, deduplicando por id
  const combinedResults = useMemo(() => {
    const map = new Map<string, Order>();
    [...(localResults || []), ...(serverResults || [])].forEach(o => { if (o?.id) map.set(String(o.id), o); });
    return Array.from(map.values()).slice(0, 20);
  }, [localResults, serverResults]);

  // Busca server-side com debounce (pedidos antigos fora da janela carregada)
  useEffect(() => {
    if (!isOpen || selected) return;
    const term = search.trim();
    if (!term) { setServerResults(null); setServerLast(''); return; }
    const timer = setTimeout(() => {
      setSearching(true);
      buscarPedidosParaEstorno({ term })
        .then((r) => {
          setServerResults(r.results);
          setServerLast(r.last);
          setServerOffline(false);
        })
        .catch(() => { setServerOffline(true); setServerResults([]); })
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, isOpen, selected]);

  const carregarMais = async () => {
    if (loadingMore || !serverLast) return;
    setLoadingMore(true);
    try {
      const r = await buscarPedidosParaEstorno({ term: search.trim(), startAfter: serverLast });
      setServerResults(prev => [...(prev || []), ...r.results]);
      setServerLast(r.last);
    } catch { /* offline já sinalizado */ }
    finally { setLoadingMore(false); }
  };

  const confirmar = async (motivo: string, senha: string) => {
    if (processando || !selected) return;
    setResultado(null);
    if (exigirSenha) {
      if (!senha) { setResultado({ ok: false, message: 'Informe a senha do administrador.' }); return; }
      const okSenha = await validateMasterPassword(senha).catch(() => false);
      if (!okSenha) { setResultado({ ok: false, message: 'Senha incorreta. Operação bloqueada.' }); return; }
    }
    setProcessando(true);
    try {
      await estornarPedido(selected.id, motivo || 'Devolução administrativa');
      const ehFiado = String(selected.paymentMethod || '').toUpperCase() === 'FIADO';
      setResultado({
        ok: true,
        message: ehFiado
          ? 'Venda fiada estornada com sucesso. Dívida do cliente revertida automaticamente.'
          : acao === 'cancelar'
            ? 'Venda cancelada com sucesso. Estoque e valores restaurados.'
            : 'Venda estornada com sucesso. Estoque e valores restaurados.',
      });
      onAfterSuccess?.(selected, motivo);
    } catch (e: any) {
      setResultado({ ok: false, message: e?.message || 'Erro ao estornar o pedido. Tente novamente.' });
    } finally {
      setProcessando(false);
    }
  };

  const resetSelecao = () => {
    setSelected(null);
    setResultado(null);
    setServerResults(null);
    setServerLast('');
    setSearch('');
  };

  const terminou = resultado?.ok === true;

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      closeOnBackdrop={!processando}
      tone={terminou ? 'success' : acao === 'cancelar' ? 'danger' : 'warning'}
      title={terminou ? 'Operação Concluída' : 'Estorno de Venda'}
      subtitle={selected && !terminou ? `Pedido #${String(selected.id || '').slice(0, 8).toUpperCase()}` : 'Devolução completa (estoque + valores)'}
      icon={acao === 'cancelar' ? <AlertTriangle size={22} /> : <RotateCcw size={20} />}
      size="md"
      footer={
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={processando}
            className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-40"
          >
            Fechar
          </button>
          {terminou && (
            <button
              type="button"
              onClick={resetSelecao}
              className="flex-1 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              <RotateCcw size={14} /> Estornar Outro Pedido
            </button>
          )}
        </div>
      }
    >
      {resultado && (
        <div className="p-5">
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${resultado.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            {resultado.ok
              ? <CheckCircle size={20} className="text-emerald-500 mt-0.5 shrink-0" />
              : <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p className={`font-black text-xs uppercase tracking-wider ${resultado.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {resultado.ok ? 'Operação concluída' : 'Operação não realizada'}
              </p>
              <p className="text-sm text-slate-600 mt-1">{resultado.message}</p>
            </div>
            {!resultado.ok && (
              <button
                onClick={() => setResultado(null)}
                className="text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-700 cursor-pointer shrink-0"
              >
                Tentar novamente
              </button>
            )}
          </div>
        </div>
      )}

      {!resultado && !selected && (
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Buscar Pedido (número, cliente ou CPF)</p>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Ex.: #ABC123 ou nome do cliente..."
                value={search}
                onChange={e => { setSearch(e.target.value); setResultado(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !searching && combinedResults.length === 1) setSelected(combinedResults[0]);
                }}
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-semibold text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 transition-all"
              />
            </div>
          </div>

          {serverOffline && !searching && (
            <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Busca avançada indisponível (Cloud Functions desatualizadas). Os resultados abaixo são limitados aos pedidos recentes já carregados.
            </p>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-h-64 overflow-y-auto custom-scrollbar">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-xs font-black uppercase tracking-widest">
                <RefreshCw size={16} className="animate-spin" /> Buscando…
              </div>
            ) : combinedResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <SearchX size={24} className="text-slate-300 mb-2" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum pedido ativo encontrado.</p>
              </div>
            ) : (
              combinedResults.map(o => (
                <button
                  key={o.id}
                  onClick={() => setSelected(o)}
                  className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-red-50 border-b border-slate-100 last:border-0 transition-all text-left"
                >
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 text-xs uppercase truncate">#{String(o.id || '').slice(0, 12)} · {o.userName || 'CONSUMIDOR GERAL'}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      {String(o.date || '').replace('T', ' ').slice(5, 16)} · {o.paymentMethod}
                    </p>
                  </div>
                  <span className="font-black text-red-500 text-sm shrink-0">R$ {formatarMoeda(o.total)}</span>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              {combinedResults.length > 0 ? `${combinedResults.length} pedido(s) listado(s)` : 'Dica: número, nome ou CPF'}
            </p>
            {!searching && serverResults && serverResults.length > 0 && (
              <button
                onClick={carregarMais}
                disabled={loadingMore || !serverLast}
                className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 disabled:opacity-40 flex items-center gap-1.5"
              >
                {loadingMore ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Carregar mais
              </button>
            )}
          </div>
        </div>
      )}

      {!resultado && selected && (
        <RefundPasswordPanel
          key={String(selected.id)}
          acao={acao}
          order={selected}
          exigirSenha={exigirSenha}
          processando={processando}
          erro=""
          onCancel={() => setSelected(null)}
          onConfirm={confirmar}
        />
      )}

      {terminou && selected && (
        <div className="p-5">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-black text-slate-900 text-xs uppercase truncate">#{String(selected.id || '').slice(0, 12)}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{selected.userName || 'CONSUMIDOR GERAL'} · {selected.paymentMethod}</p>
            </div>
            <span className="font-black text-emerald-600 text-sm shrink-0">R$ {formatarMoeda(selected.total)}</span>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default RefundSaleModal;