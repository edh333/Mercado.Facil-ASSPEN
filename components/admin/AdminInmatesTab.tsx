import React from 'react';
import { formatarMoeda } from '../../utils';
import { Shield, Plus, Trash2, Search, UserCheck, FileUp, LayoutGrid, Smartphone, Loader2, Printer, Pencil, MapPin, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/StoreContext';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';
import { PreRegisteredInmate } from '../../types';
import { gerarComprovanteDevolucaoAlvara } from '../../utils/printUtils';

interface AdminInmatesTabProps {
  preRegisteredInmates: PreRegisteredInmate[];
  users: any[];
  newInmate: { name: string; cpf: string; unit?: string };
  setNewInmate: (data: any) => void;
  handleAddInmate: () => void;
  deletePreRegisteredInmate: (id: string) => void;
  importInmatesCsv?: (file: File, senhaMestra?: string) => Promise<void>;
  onRequestMasterPassword?: (callback: (senhaMestra: string) => void) => void;
  inmatesLimit?: number;
  loadMoreInmates?: () => void;
}

export const AdminInmatesTab: React.FC<AdminInmatesTabProps> = ({
  preRegisteredInmates, users, newInmate, setNewInmate, handleAddInmate, deletePreRegisteredInmate, importInmatesCsv, inmatesLimit, loadMoreInmates,
  onRequestMasterPassword
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('table');
  const [inmateParaExcluir, setInmateParaExcluir] = React.useState<any>(null);
  const [inmateParaAlvara, setInmateParaAlvara] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { showNotification: notifCtx, updatePreRegisteredInmate, devolucaoAlvara } = useApp();

  const handleDeleteInmate = (inmate: any) => {
    const vinculados = inmate?.linkedUsers?.length || 0;
    if (vinculados > 0) {
      notifCtx(`NÃO É POSSÍVEL REMOVER: ${vinculados} familiar(es) vinculado(s) a ${inmate?.name || 'este interno'}. Transfira os familiares para outro interno antes de remover.`, 'error');
      return;
    }
    setInmateParaExcluir(inmate);
  };

  const handleAlvaraReturn = (inmate: any) => {
    const totalBalance = inmate?.totalBalance || 0;
    if (totalBalance <= 0) {
      notifCtx('Este interno não possui saldo a ser devolvido.', 'warning');
      return;
    }
    setInmateParaAlvara(inmate);
  };

  const confirmAlvaraReturn = async (senhaMestra: string) => {
    if (!inmateParaAlvara) return;
    const linkedUsers = (users || []).filter(u =>
      (u.assignedInmate?.id === inmateParaAlvara.id || u.assignedInmate === inmateParaAlvara.id) ||
      (String(u.inmateCpf || u.prisonerCpf || '').replace(/\D/g, '') === String(inmateParaAlvara?.cpf || '').replace(/\D/g, ''))
    );
    // Devolve de TODOS os familiares com saldo: a validação somava o saldo de
    // todos, mas a chamada creditava só linkedUsers[0] — o restante ficava
    // retido. Agora é um chamado por familiar com saldo.
    const alvos = linkedUsers.filter(u => Number(u.walletBalance || 0) > 0);
    const totalBalance = alvos.reduce((sum, u) => sum + Number(u.walletBalance || 0), 0);
    if (totalBalance <= 0) {
      notifCtx('Saldo zerado — nada a devolver.', 'warning');
      setInmateParaAlvara(null);
      return;
    }
    setIsLoading(true);
    let totalDevolvido = 0;
    let falhas = 0;
    const comprovantes: string[] = [];
    for (const u of alvos) {
      try {
        const data = await devolucaoAlvara(
          u.id,
          `Devolução por alvará do interno ${inmateParaAlvara?.name || '—'}`,
          senhaMestra
        );
        if (data?.ok) {
          totalDevolvido += Number(data.valorDevolvido || 0);
          const comprovante = data.comprovante;
          if (comprovante) {
            comprovantes.push(gerarComprovanteDevolucaoAlvara({
              tipo: comprovante.tipo,
              usuarioId: comprovante.usuarioId,
              usuarioNome: comprovante.usuarioNome,
              cpf: comprovante.cpf,
              saldoAnterior: comprovante.saldoAnterior,
              valorDevolvido: comprovante.valorDevolvido,
              novoSaldo: comprovante.novoSaldo,
              motivo: comprovante.motivo,
              operador: comprovante.operador,
              data: comprovante.data,
            }));
          }
        }
      } catch {
        falhas++; // o contexto já exibiu a notificação de erro desta chamada
      }
    }
    // Impressão única: um comprovante por familiar na mesma janela.
    if (comprovantes.length > 0) {
      const texto = comprovantes.join('\n');
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const corpo = texto
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comprovante Alvará</title><style>
          body { font-family: 'Courier New', monospace; color:#0f172a; padding:32px; background:#fff; white-space: pre-wrap; }
        </style></head><body>${corpo}</body></html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { try { printWindow.print(); } catch { /* janela fechou */ } }, 350);
      }
    }
    if (totalDevolvido > 0 && (alvos.length > 1 || falhas > 0)) {
      // Com 1 acerto o contexto já avisou "Devolução de R$ X realizada".
      notifCtx(
        falhas > 0
          ? `Devolução parcial de R$ ${formatarMoeda(totalDevolvido)} — ${falhas} familiar(es) falharam. Repita para os pendentes.`
          : `R$ ${formatarMoeda(totalDevolvido)} devolvidos em ${alvos.length} carteira(s).`,
        falhas > 0 ? 'warning' : 'success'
      );
    }
    setInmateParaAlvara(null);
    setIsLoading(false);
  };

  // Edição do pré-cadastro: antes só existia CADASTRAR/EXCLUIR — a função
  // updatePreRegisteredInmate já existia no contexto, mas não tinha UI.
  const [editando, setEditando] = React.useState<PreRegisteredInmate | null>(null);

  const iniciarEdicao = (inmate: PreRegisteredInmate) => {
    setEditando(inmate);
    setNewInmate({ name: inmate.name || '', cpf: inmate.cpf || '', unit: inmate.unit || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setNewInmate({ name: '', cpf: '', unit: '' });
  };

  const handleSalvar = async () => {
    if (!editando) { handleAddInmate(); return; }
    // O registro pode ter sido removido (nesta tela, outra aba ou outro
    // dispositivo) enquanto o formulário estava aberto: o setDoc com merge
    // RECRIARIA o doc apagado, ressuscitando um cadastro pela metade.
    if ((preRegisteredInmates || []).length > 0 && !preRegisteredInmates.some(i => i.id === editando.id)) {
      notifCtx('Este interno não existe mais (foi removido). Formulário limpo.', 'error');
      cancelarEdicao();
      return;
    }
    const nome = String(newInmate?.name || '').trim();
    const cpf = String(newInmate?.cpf || '').trim();
    if (!nome || !cpf) { notifCtx('Nome e CPF são obrigatórios.', 'error'); return; }
    const ok = await updatePreRegisteredInmate(editando.id, { name: nome, cpf, unit: String(newInmate?.unit || '').trim() });
    // Sai da edição só em sucesso — falha (CPF inválido/duplicado/rede) mantém o formulário preenchido.
    if (ok) cancelarEdicao();
  };

  const consolidatedData = React.useMemo(() => {
    return (preRegisteredInmates || []).map(inmate => {
        const cpfInmate = String(inmate.cpf || '').replace(/\D/g, '');
        const linkedUsers = (users || []).filter(u =>
            (u.assignedInmate?.id === inmate.id || u.assignedInmate === inmate.id) ||
            (cpfInmate && String(u.inmateCpf || u.prisonerCpf || '').replace(/\D/g, '') === cpfInmate)
        );
        const totalBalance = linkedUsers.reduce((sum, u) => sum + Number(u.walletBalance || 0), 0);
        const totalSpentWeekly = linkedUsers.reduce((sum, u) => sum + Number(u.weeklySpent || 0), 0);
        return { ...inmate, linkedUsers, totalBalance, totalSpentWeekly };
    });
  }, [preRegisteredInmates, users]);

  const filteredInmates = consolidatedData.filter(i =>
    (i.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (i.cpf || '').includes(searchTerm || '')
  ).sort((a,b) => b.totalBalance - a.totalBalance);

  const totalInmates = consolidatedData.length;
  const withFamily = consolidatedData.filter(i => i.linkedUsers.length > 0).length;

  const printInmateList = () => {
    const items = [...consolidatedData].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (items.length === 0) return;
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const hoje = new Date().toLocaleDateString('pt-BR');
    const totalGlobal = consolidatedData.reduce((s, i) => s + i.totalBalance, 0);
    const rows = items.map(i => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:800;text-transform:uppercase;">${esc(i.name)}<div style="font-size:10px;color:#64748b;font-weight:700;letter-spacing:1px;">CPF ${esc(i.cpf || '—')}</div></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#334155;">${(i.linkedUsers || []).map((u: any) => esc(u.name)).join('<br/>') || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;font-weight:800;">${(i.linkedUsers || []).length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:800;color:${Number(i.totalBalance) > 0 ? '#059669' : '#0f172a'};">R$ ${formatarMoeda(i.totalBalance)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Lista de Internos</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #0f766e; padding-bottom:14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:18px; text-transform:uppercase; letter-spacing:1px; color:#0f766e; }
    .cabecalho p { font-size:11px; color:#64748b; margin-top:3px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    .cards { display:flex; gap:12px; margin-bottom:18px; }
    .card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; }
    .card .titulo { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:3px; }
    .card .valor { font-size:16px; font-weight:800; }
    table { width:100%; border-collapse:collapse; }
    thead th { background:#0f172a; color:#fff; padding:9px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    .rodape { margin-top:16px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    @media print { @page { size: A4; margin: 14mm 12mm; } body { padding:14px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>Lista de Internos</h1>
            <p>Mercado Fácil — relação de internos com familiares vinculados</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje}</b></p>
            <p>${items.length} internos</p>
        </div>
    </div>
    <div class="cards">
        <div class="card"><p class="titulo">Internos</p><p class="valor">${items.length}</p></div>
        <div class="card"><p class="titulo">Com Família</p><p class="valor">${items.filter(i => (i.linkedUsers || []).length > 0).length}</p></div>
        <div class="card"><p class="titulo">Saldo Acumulado Global</p><p class="valor" style="color:#059669">R$ ${formatarMoeda(totalGlobal)}</p></div>
    </div>
    <table>
        <thead><tr><th>Interno</th><th>Familiares</th><th style="text-align:center;">Qtd.</th><th style="text-align:right;">Saldo Acumulado</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:34px;display:flex;justify-content:space-between;">
        <div style="width:40%;border-top:1px solid #64748b;padding-top:8px;font-size:10px;text-transform:uppercase;text-align:center;color:#475569;">Responsável / Carimbo</div>
    </div>
    <p class="rodape">Documento gerado pelo sistema Mercado Fácil</p>
</body>
        </html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // print() síncrono logo após document.write() imprime PÁGINA EM BRANCO
      // no Chromium (snapshot antes de o layout terminar). O atraso curto
      // espera a renderização sem abrir diálogo duplicado.
      setTimeout(() => { try { printWindow.print(); } catch { /* janela fechou */ } }, 350);
    }
  };

  return (
    <div className="animate-slideUp space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
        <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2 tracking-tight">
          <Shield size={24} className="text-emerald-500"/> Gestão de Internos
        </h2>
        <div className="flex flex-wrap gap-3">
            <label className="text-[10px] font-black uppercase text-indigo-500 border-2 border-indigo-500/20 px-4 py-2 rounded-xl bg-indigo-500/5 shadow-sm cursor-pointer hover:bg-indigo-500/10 transition-all flex items-center gap-2">
                <FileUp size={14}/> Importar CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (file && onRequestMasterPassword) {
                  onRequestMasterPassword((senha) => importInmatesCsv?.(file, senha));
                } else if (file) {
                  importInmatesCsv?.(file);
                }
              }} />
            </label>
            <div className="text-[10px] font-black uppercase text-[var(--text-main)] border-2 border-[var(--border-color)] px-4 py-2 rounded-xl bg-[var(--bg-main)]">
                Total: {totalInmates}
            </div>
            <div className="text-[10px] font-black uppercase text-sky-500 border-2 border-sky-500/20 px-4 py-2 rounded-xl bg-sky-500/5 shadow-sm" title="Internos que já possuem ao menos um familiar com conta cadastrada">
                {withFamily}/{totalInmates} com família ({totalInmates ? Math.round((withFamily / totalInmates) * 100) : 0}%)
            </div>
            <button
                onClick={printInmateList}
                title="Imprimir lista completa de internos com saldos"
                className="text-[10px] font-black uppercase border-2 border-[var(--border-color)] px-4 py-2 rounded-xl bg-[var(--bg-card)] text-[var(--text-main)] hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all flex items-center gap-2"
            >
                <Printer size={14}/> Imprimir
            </button>
            <button
                onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                className="text-[10px] font-black uppercase border-2 border-[var(--border-color)] px-4 py-2 rounded-xl bg-[var(--bg-card)] text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-all flex items-center gap-2"
            >
                {viewMode === 'table' ? <><LayoutGrid size={14} /> Cards</> : <><Smartphone size={14} /> Tabela</>}
            </button>
            <div className="text-[10px] font-black uppercase text-emerald-500 border-2 border-emerald-500/20 px-4 py-2 rounded-xl bg-emerald-500/5 shadow-sm">
                Global: R$ {formatarMoeda(consolidatedData.reduce((s, i) => s + i.totalBalance, 0))}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Registration Form */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          <div className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl h-fit relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 rounded-full -mr-16 -mt-16"></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text-main)] mb-6 flex items-center gap-2 relative z-10">
                {editando ? <><Pencil size={18} className="text-emerald-500"/> Editar Interno</> : <><Plus size={18} className="text-emerald-500"/> Novo Pré-Cadastro</>}
              </h3>
              <div className="space-y-4 relative z-10">
                  <div>
                      <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">Nome Completo</label>
                      <input
                          className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl font-bold text-sm text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                          placeholder="EX: NOME SOBRENOME"
                          value={newInmate?.name || ''}
                          onChange={e => setNewInmate({...newInmate, name: e.target.value.toUpperCase()})}
                      />
                  </div>
                  <div>
                      <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">CPF (Apenas Números)</label>
                      <input
                          className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl font-bold text-sm text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                          placeholder="000.000.000-00"
                          value={newInmate?.cpf || ''}
                          onChange={e => setNewInmate({...newInmate, cpf: e.target.value.replace(/\D/g, '')})}
                      />
                  </div>
                  <div>
                      <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1 flex items-center gap-1.5"><MapPin size={11} className="text-emerald-500"/> Localização (Opcional)</label>
                      <input
                          className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl font-bold text-sm text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                          placeholder="EX: ALA B - CELA 12"
                          value={newInmate?.unit || ''}
                          onChange={e => setNewInmate({...newInmate, unit: e.target.value.toUpperCase()})}
                      />
                  </div>
                  <button
                      onClick={handleSalvar}
                      className="w-full py-5 bg-emerald-500 text-white font-black rounded-2xl hover:opacity-90 transition-all shadow-xl uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 mt-2"
                  >
                      {editando ? <><Pencil size={18}/> Atualizar Cadastro</> : <><UserCheck size={18}/> Salvar no Banco</>}
                  </button>
                  {editando && (
                      <button
                          onClick={cancelarEdicao}
                          className="w-full py-3 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest"
                      >
                          Cancelar Edição
                      </button>
                  )}
              </div>
              <p className="mt-6 text-[9px] text-[var(--text-muted)] italic font-medium leading-relaxed">
                Nota: Apenas internos registrados poderão ter familiares vinculados e receber créditos.
              </p>
          </div>
        </div>

        {/* List of Inmates */}
        <div className="lg:col-span-7 xl:col-span-8 bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-[var(--bg-main)] border-b border-[var(--border-color)]">
                <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-2.5 rounded-xl border border-[var(--border-color)] group-focus-within:bg-[var(--text-main)] group-focus-within:border-[var(--text-main)] transition-all duration-300">
                        <Search className="text-[var(--text-muted)] group-focus-within:text-[var(--bg-card)] transition-colors" size={18}/>
                    </div>
                    <input
                        className="w-full bg-[var(--bg-card)] pl-16 pr-6 py-4.5 border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl outline-none font-black text-xs text-[var(--text-main)] transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                        placeholder="PESQUISAR POR NOME OU CPF..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px] divide-y divide-slate-200 custom-scrollbar">
                {viewMode === 'table' && (
                    <table className="w-full text-left">
                        <thead className="bg-[var(--bg-main)] text-[var(--text-muted)] font-black uppercase text-[9px] tracking-widest sticky top-0 border-b border-[var(--border-color)]">
                            <tr>
                                <th className="p-5">Nome / CPF</th>
                                <th className="p-5">Familiares</th>
                                <th className="p-5 text-right">Saldo Acumulado</th>
                                <th className="p-5 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {filteredInmates.length === 0 ? (
                                <tr><td colSpan={4} className="p-20 text-center font-black uppercase text-xs opacity-70"><Shield size={40} className="mx-auto mb-4"/> Nenhum Registro</td></tr>
                            ) : filteredInmates.map((inmate: any) => (
                                <tr key={inmate.id} className="hover:bg-[var(--bg-main)]/50 transition-all group">
                                    <td className="p-5">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="font-black text-[var(--text-main)] text-sm uppercase tracking-tight">{inmate?.name || 'Sem nome'}</div>
                                            <span className="text-[9px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black tracking-widest">{inmate?.cpf || '—'}</span>
                                            {inmate?.unit && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black tracking-widest flex items-center gap-1"><MapPin size={9}/>{inmate.unit}</span>}
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="flex -space-x-2">
                                                {inmate.linkedUsers.slice(0, 3).map((u: any) => (
                                                    <div key={u.id} className="w-8 h-8 rounded-full border-2 border-white bg-[var(--bg-main)] flex items-center justify-center overflow-hidden shadow-sm" title={u.name || ''}>
                                                        <span className="text-[10px] font-black text-[var(--text-muted)]">{(u.name || '?').charAt(0)}</span>
                                                    </div>
                                                ))}
                                                {inmate.linkedUsers && inmate.linkedUsers.length > 3 && (
                                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-slate-800 text-[10px] font-black shadow-sm">
                                                        +{inmate.linkedUsers.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-tight">{inmate.linkedUsers.length} Familiar(es)</div>
                                        </div>
                                    </td>
                                    <td className={`p-5 text-right font-black text-base tracking-tighter ${inmate.totalBalance > 0 ? 'text-emerald-600' : 'text-[var(--text-muted)] opacity-30'}`}>
                                        R$ {formatarMoeda(inmate.totalBalance)}
                                    </td>
                                    <td className="p-5 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => iniciarEdicao(inmate)}
                                                title="Editar cadastro"
                                                className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-emerald-500 hover:border-emerald-500/20 hover:bg-emerald-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                            >
                                                <Pencil size={18}/>
                                            </button>
                                            <button
                                                onClick={() => handleAlvaraReturn(inmate)}
                                                title="Devolver saldo por alvará"
                                                className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-amber-500 hover:border-amber-500/20 hover:bg-amber-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                            >
                                                <RotateCcw size={18}/>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteInmate(inmate)}
                                                className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                            >
                                                <Trash2 size={18}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {viewMode === 'cards' && (
                    <>
                {filteredInmates.length === 0 ? (
                    <div className="p-20 text-center opacity-10">
                        <Shield size={48} className="mx-auto mb-2"/>
                        <p className="text-xs font-black uppercase tracking-widest">Nenhum Registro</p>
                    </div>
                ) : filteredInmates.map((inmate: any) => (
                    <div key={inmate.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-[var(--bg-main)] transition-all group border-l-4 border-transparent hover:border-emerald-500">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                <p className="font-black text-[var(--text-main)] text-sm uppercase tracking-tight truncate">{inmate?.name || 'Sem nome'}</p>
                                <span className="text-[9px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black tracking-widest shrink-0">{inmate?.cpf || '—'}</span>
                                {inmate?.unit && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black tracking-widest flex items-center gap-1 shrink-0"><MapPin size={9}/>{inmate.unit}</span>}
                            </div>
                            <div className="flex items-center gap-4 mt-2">
                                <div className="flex -space-x-2">
                                    {inmate.linkedUsers.slice(0, 3).map((u: any) => (
                                        <div key={u.id} className="w-8 h-8 rounded-full border-2 border-white bg-[var(--bg-main)] flex items-center justify-center overflow-hidden shadow-sm" title={u.name || ''}>
                                            <span className="text-[10px] font-black text-[var(--text-muted)]">{(u.name || '?').charAt(0)}</span>
                                        </div>
                                    ))}
                                    {inmate.linkedUsers && inmate.linkedUsers.length > 3 && (
                                        <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-slate-800 text-[10px] font-black shadow-sm">
                                            +{inmate.linkedUsers.length - 3}
                                        </div>
                                    )}
                                </div>
                                <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-tight">
                                    {inmate.linkedUsers.length} Familiar(es)
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-8 w-full md:w-auto border-t md:border-t-0 border-[var(--border-color)] pt-4 md:pt-0 mt-2 md:mt-0">
                            <div className="flex-1 md:text-right">
                                <p className="text-[9px] font-black text-[var(--text-muted)] uppercase leading-none mb-1 tracking-widest">Saldo Acumulado</p>
                                <p className={`font-black text-xl tracking-tighter ${inmate.totalBalance > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)] opacity-30'}`}>
                                    R$ {formatarMoeda(inmate.totalBalance)}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => iniciarEdicao(inmate)}
                                    title="Editar cadastro"
                                    className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-emerald-500 hover:border-emerald-500/20 hover:bg-emerald-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                >
                                    <Pencil size={18}/>
                                </button>
                                <button
                                    onClick={() => handleAlvaraReturn(inmate)}
                                    title="Devolver saldo por alvará"
                                    className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-amber-500 hover:border-amber-500/20 hover:bg-amber-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                >
                                    <RotateCcw size={18}/>
                                </button>
                                <button
                                    onClick={() => handleDeleteInmate(inmate)}
                                    className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                >
                                    <Trash2 size={18}/>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                    </>
                )}
            </div>
            {loadMoreInmates && inmatesLimit && (preRegisteredInmates || []).length >= inmatesLimit && (
              <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-main)]">
                <button
                  onClick={loadMoreInmates}
                  className="w-full py-3 bg-[var(--bg-card)] border-2 border-[var(--border-color)] text-[var(--text-main)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all flex items-center justify-center gap-2"
                >
                  <Loader2 size={14} /> Carregar mais internos
                </button>
              </div>
            )}
        </div>
      </div>
      <ConfirmacaoDestrutiva
        isOpen={inmateParaExcluir !== null}
        titulo="Remover Interno"
        descricao={`REMOVER DEFINITIVAMENTE ${inmateParaExcluir?.name || 'este preso'}? O histórico de vínculo será perdido, mas os saldos dos familiares não são afetados.`}
        palavraChave="REMOVER"
        onConfirm={() => { if (inmateParaExcluir?.id) deletePreRegisteredInmate(inmateParaExcluir.id); setInmateParaExcluir(null); }}
        onClose={() => setInmateParaExcluir(null)}
      />
      <ConfirmacaoDestrutiva
        isOpen={inmateParaAlvara !== null}
        titulo="Devolução por Alvará"
        descricao={`Devolver R$ ${formatarMoeda(inmateParaAlvara?.totalBalance || 0)} (saldo acumulado de ${inmateParaAlvara?.name || 'este interno'}) para as carteiras de TODOS os familiares vinculados com saldo? A senha mestra será exigida e o comprovante será impresso para assinatura.`}
        semDigitar
        processando={isLoading}
        onConfirm={() => {
          if (!inmateParaAlvara) return;
          if (onRequestMasterPassword) {
            onRequestMasterPassword((senha) => confirmAlvaraReturn(senha));
          } else {
            confirmAlvaraReturn('');
          }
        }}
        onClose={() => { if (!isLoading) setInmateParaAlvara(null); }}
      />
    </div>
  );
};
