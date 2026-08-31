import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useApp } from '../../context/StoreContext';
import { Activity, Users, ShoppingBag, AlertTriangle, Loader2, Gauge, Trash2, Download, ShieldCheck, X } from 'lucide-react';

interface Capacidade {
  hoje: number | null;
  semana: number | null;
  mes: number | null;
  ano: number | null;
  total: number | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR');

export const AdminCapacityPanel: React.FC = () => {
  const { users } = useApp();
  const [capacidade, setCapacidade] = useState<Capacidade>({ hoje: null, semana: null, mes: null, ano: null, total: null });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [diasLimpeza, setDiasLimpeza] = useState(90);
  const [apagarArquivos, setApagarArquivos] = useState(true);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const [cleanupErro, setCleanupErro] = useState('');

  const contar = async () => {
    setLoading(true);
    setErro('');
    try {
      const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
      const inicioSemana = new Date(); inicioSemana.setDate(inicioSemana.getDate() - 7);
      const inicioMes = new Date(); inicioMes.setDate(inicioMes.getDate() - 30);
      const inicioAno = new Date(); inicioAno.setFullYear(inicioAno.getFullYear() - 1);

      const [cHoje, cSemana, cMes, cAno, cTotal] = await Promise.all([
        getCountFromServer(query(collection(db, 'orders'), where('createdAt', '>=', inicioDoDia.toISOString()))),
        getCountFromServer(query(collection(db, 'orders'), where('createdAt', '>=', inicioSemana.toISOString()))),
        getCountFromServer(query(collection(db, 'orders'), where('createdAt', '>=', inicioMes.toISOString()))),
        getCountFromServer(query(collection(db, 'orders'), where('createdAt', '>=', inicioAno.toISOString()))),
        getCountFromServer(collection(db, 'orders')),
      ]);

      setCapacidade({
        hoje: cHoje.data().count,
        semana: cSemana.data().count,
        mes: cMes.data().count,
        ano: cAno.data().count,
        total: cTotal.data().count,
      });
    } catch (e: any) {
      setErro('Falha ao consultar contadores: ' + (e?.message || 'tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    contar();
  }, []);

  const familiaresCadastrados = (users || []).filter(u => u.role === 'FAMILY' && u.status === 'active').length;
  const familiaresTotal = (users || []).filter(u => u.role === 'FAMILY').length;

  const pedidosHoje = capacidade.hoje ?? 0;
  const usuariosAcessandoHoje = Math.max(familiaresCadastrados, 1);
  const estimativaLeiturasDia = Math.round(pedidosHoje * 8 + usuariosAcessandoHoje * 350 + 2000);
  const estimativaEscritasDia = Math.round(pedidosHoje * 7 + 300);
  const pctLeituras = Math.round((estimativaLeiturasDia / 50000) * 100);
  const pctEscritas = Math.round((estimativaEscritasDia / 20000) * 100);
  const riscoAlto = pctLeituras >= 70 || pctEscritas >= 70;

  const executarLimpeza = async () => {
    if (cleanupRunning) return;
    setCleanupRunning(true);
    setCleanupErro('');
    setCleanupResult(null);
    try {
      const fn = httpsCallable(getFunctions(), 'limparDadosAntigos');
      const res = await fn({ dias: diasLimpeza, apagarArquivos });
      const data = res.data as any;
      if (data && !data.ok) throw new Error(data.mensagem || 'Falha ao limpar dados antigos.');
      setCleanupResult(data);
      if (data && data.total > 0) {
        setTimeout(() => contar(), 1500);
      }
    } catch (e: any) {
      setCleanupErro(e?.message || 'Erro ao executar a limpeza. Tente novamente.');
    } finally {
      setCleanupRunning(false);
    }
  };

  const Card = ({ label, valor, cor }: { label: string; valor: string; cor: string }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-black tracking-tight ${cor}`}>{valor}</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--primary-color)]/100 rounded-2xl">
            <Gauge size={22} className="text-[var(--primary-color)]" />
          </div>
          <div>
            <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Capacidade de Atendimento</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pedidos por período • usuários • estimativa de uso do Firestore</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={20} className="animate-spin text-[var(--primary-color)]" />}
          <button
            onClick={() => { setShowCleanupModal(true); setCleanupResult(null); setCleanupErro(''); }}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Trash2 size={14} /> Backup + Limpar Antigos
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-xs font-bold">
          <AlertTriangle size={16} /> {erro}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card label="Pedidos Hoje" valor={capacidade.hoje === null ? '—' : fmt(capacidade.hoje)} cor="text-[var(--primary-color)]" />
        <Card label="Últimos 7 Dias" valor={capacidade.semana === null ? '—' : fmt(capacidade.semana)} cor="text-blue-600" />
        <Card label="Últimos 30 Dias" valor={capacidade.mes === null ? '—' : fmt(capacidade.mes)} cor="text-purple-600" />
        <Card label="Último Ano" valor={capacidade.ano === null ? '—' : fmt(capacidade.ano)} cor="text-amber-600" />
        <Card label="Total Histórico" valor={capacidade.total === null ? '—' : fmt(capacidade.total)} cor="text-slate-800" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-500" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Famílias Ativas</p>
          </div>
          <p className="text-xl font-black text-slate-900">{familiaresCadastrados}</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase">de {familiaresTotal} cadastrados</p>
        </div>
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag size={16} className="text-[var(--primary-color)]" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Média por Dia (30d)</p>
          </div>
          <p className="text-xl font-black text-slate-900">
            {capacidade.mes === null ? '—' : fmt(Math.round(capacidade.mes / 30))}
          </p>
          <p className="text-[9px] text-slate-400 font-bold uppercase">pedidos/dia na média</p>
        </div>
        <div className={`rounded-2xl border p-4 ${riscoAlto ? 'bg-red-50 border-red-200' : 'bg-[var(--primary-color)]/50 border-[var(--primary-color)]/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className={riscoAlto ? 'text-red-500' : 'text-[var(--primary-color)]'} />
            <p className={`text-[10px] font-black uppercase tracking-wider ${riscoAlto ? 'text-red-600' : 'text-[var(--primary-color)]'}`}>Uso Estimado da Cota</p>
          </div>
          <p className={`text-xl font-black ${riscoAlto ? 'text-red-600' : 'text-[var(--primary-color)]'}`}>{pctLeituras}% / {pctEscritas}%</p>
          <p className="text-[9px] text-slate-500 font-bold uppercase">leituras / escritas diárias</p>
        </div>
      </div>

      {riscoAlto && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-red-600 rounded-2xl px-5 py-4 shadow-lg">
          <AlertTriangle size={22} className="text-white shrink-0" />
          <div className="flex-1">
            <p className="font-black text-white uppercase tracking-wider text-xs">Uso da cota acima de 70% — limpeza recomendada</p>
            <p className="text-[10px] text-red-100 font-bold leading-relaxed mt-0.5">
              O sistema está próximo do limite do plano gratuito (50.000 leituras e 20.000 escritas/dia). Para evitar lentidão, é recomendado limpar os dados antigos — o sistema salva uma cópia de segurança antes de remover qualquer coisa.
            </p>
          </div>
          <button
            onClick={() => { setShowCleanupModal(true); setCleanupResult(null); setCleanupErro(''); }}
            disabled={cleanupRunning}
            className="shrink-0 px-6 py-3 bg-white text-red-600 rounded-xl font-black text-[11px] uppercase tracking-wider flex items-center gap-2 hover:bg-red-50 active:scale-95 transition-all disabled:opacity-60"
          >
            <ShieldCheck size={16} /> Limpar Dados Antigos
          </button>
        </div>
      )}

      {!riscoAlto && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Activity size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-700 font-bold leading-relaxed">
            O sistema opera com folga confortável da cota gratuita do Firestore (50.000 leituras e 20.000 escritas/dia). Com o volume atual não há risco de travamento. Quando o uso ultrapassar 70%, o sistema alertará automaticamente e o administrador poderá limpar os dados antigos com backup de segurança.
          </p>
        </div>
      )}

      {/* Modal de limpeza */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!cleanupRunning) setShowCleanupModal(false); }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h4 className="font-black text-sm uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <ShieldCheck size={18} className="text-[var(--primary-color)]" /> Backup + Limpeza de Dados Antigos
              </h4>
              <button onClick={() => { if (!cleanupRunning) setShowCleanupModal(false); }} className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] font-bold text-slate-600 leading-relaxed space-y-2">
              <p className="flex items-start gap-2"><Download size={14} className="text-[var(--primary-color)] shrink-0 mt-0.5" /> <span>1º — O sistema cria uma <b>cópia de segurança completa</b> (arquivo JSON no Storage com link de download válido por 7 dias).</span></p>
              <p className="flex items-start gap-2"><ShieldCheck size={14} className="text-[var(--primary-color)] shrink-0 mt-0.5" /> <span>2º — Grava uma <b>cópia permanente em historico_geral</b> (trilha de auditoria, nunca se perde).</span></p>
              <p className="flex items-start gap-2"><Trash2 size={14} className="text-red-500 shrink-0 mt-0.5" /> <span>3º — Remove da operação os <b>pedidos, depósitos e despesas mais antigos</b> do que o período escolhido. Pedidos pendentes de análise <b>nunca</b> são removidos.</span></p>
              <p className="flex items-start gap-2"><Download size={14} className="text-amber-500 shrink-0 mt-0.5" /> <span>4º — Quando marcada a opção abaixo, <b>os comprovantes (arquivos) dos registros arquivados são apagados do armazenamento</b>, liberando a cota do plano. A trilha de auditoria no histórico preserva os dados; documentos de identidade <b>nunca</b> são apagados.</span></p>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Remover dados mais antigos que (dias)</label>
              <select
                value={diasLimpeza}
                onChange={e => setDiasLimpeza(Number(e.target.value))}
                disabled={cleanupRunning}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 font-black text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
              >
                <option value={30}>30 dias (agressivo)</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias (recomendado)</option>
                <option value={180}>180 dias (conservador)</option>
                <option value={365}>365 dias (mínima limpeza)</option>
              </select>
            </div>

            {cleanupErro && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-xs font-bold">
                <AlertTriangle size={16} /> {cleanupErro}
              </div>
            )}

            {cleanupResult && (
              <div className="bg-[var(--primary-color)]/50 border border-[var(--primary-color)]/20 rounded-xl p-4 text-xs font-bold text-[var(--primary-color)] space-y-2">
                {cleanupResult.total === 0 ? (
                  <p className="flex items-center gap-2"><ShieldCheck size={16} /> {cleanupResult.mensagem || 'Nenhum dado antigo encontrado dentro do período.'}</p>
                ) : (
                  <>
                    <p className="flex items-center gap-2"><ShieldCheck size={16} /> Limpeza concluída com sucesso! <b>{fmt(cleanupResult.total)}</b> registros arquivados:</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white rounded-xl py-2 px-1 border border-[var(--primary-color)]/20">
                        <p className="text-[9px] text-[var(--primary-color)] uppercase font-black">Pedidos</p>
                        <p className="font-black">{fmt(cleanupResult.porColecao?.orders || 0)}</p>
                      </div>
                      <div className="bg-white rounded-xl py-2 px-1 border border-[var(--primary-color)]/20">
                        <p className="text-[9px] text-[var(--primary-color)] uppercase font-black">Depósitos</p>
                        <p className="font-black">{fmt(cleanupResult.porColecao?.wallet_transactions || 0)}</p>
                      </div>
                      <div className="bg-white rounded-xl py-2 px-1 border border-[var(--primary-color)]/20">
                        <p className="text-[9px] text-[var(--primary-color)] uppercase font-black">Despesas</p>
                        <p className="font-black">{fmt(cleanupResult.porColecao?.expenses || 0)}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-[var(--primary-color)] leading-relaxed">Cópia de segurança salva em <b>historico_geral</b> (permanente) e, quando disponível, arquivo JSON no Storage.</p>
                    {(cleanupResult.arquivosApagados > 0 || cleanupResult.arquivosFalha > 0) && (
                      <p className="text-[10px] text-slate-600 leading-relaxed bg-white rounded-xl py-2 px-3 border border-[var(--primary-color)]/20">
                        Arquivos de comprovante apagados do armazenamento: <b>{fmt(cleanupResult.arquivosApagados || 0)}</b>
                        {cleanupResult.arquivosFalha > 0 && <> ({fmt(cleanupResult.arquivosFalha)} com falha — espaço não liberado nesses; serão apagados na próxima limpeza)</>}.
                      </p>
                    )}
                    {cleanupResult.backupUrl ? (
                      <a
                        href={cleanupResult.backupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-slate-700 transition-all"
                      >
                        <Download size={14} /> Baixar Cópia de Segurança (JSON)
                      </a>
                    ) : (
                      <p className="text-[10px] text-amber-600 font-black uppercase flex items-center gap-2">
                        <AlertTriangle size={14} /> Backup em Storage indisponível no momento — o histórico no Firestore já preserva todos os dados.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {!cleanupResult && (
              <>
                <label className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apagarArquivos}
                    onChange={e => setApagarArquivos(e.target.checked)}
                    disabled={cleanupRunning}
                    className="mt-0.5 w-4 h-4 accent-red-600 shrink-0"
                  />
                  <span className="text-[11px] font-bold text-red-700 leading-relaxed">
                    Apagar também os <b>comprovantes (arquivos)</b> dos registros arquivados — libera o armazenamento do plano (é o que evita encher a cota). Documentos de identidade <b>nunca</b> são apagados.
                  </span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowCleanupModal(false)}
                  disabled={cleanupRunning}
                  className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl font-black text-[11px] uppercase tracking-wider hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={executarLimpeza}
                  disabled={cleanupRunning}
                  className="flex-[1.5] py-3.5 bg-red-600 text-white rounded-xl font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
                >
                  {cleanupRunning ? <><Loader2 size={16} className="animate-spin" /> Backup + Limpando...</> : <><ShieldCheck size={16} /> Confirmar Backup + Limpeza</>}
                </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

