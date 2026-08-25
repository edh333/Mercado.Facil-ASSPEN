import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Search, Send, Users, Megaphone, Inbox } from 'lucide-react';
import { Message, User } from '../../types';
import { isAdminRole } from '../../utils';

interface AdminMessagesTabProps {
  users: User[];
  messages: Message[];
  sendMessage: (msg: Message) => Promise<void>;
}

const ALL_USERS = 'ALL';

export const AdminMessagesTab: React.FC<AdminMessagesTabProps> = ({ users, messages, sendMessage }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const familiares = useMemo(() => {
    const termo = (search || '').toLowerCase();
    return (users || [])
      .filter(u =>
        u.status === 'active' &&
        (u.approved !== false) &&
        !isAdminRole(u.role) &&
        (u as any).deleted !== true &&
        (!termo ||
          (u.name || '').toLowerCase().includes(termo) ||
          (u.inmateName || u.prisonerName || '').toLowerCase().includes(termo) ||
          (u.cpf || '').replace(/\D/g, '').includes(termo.replace(/\D/g, '')))
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, search]);

  const thread = useMemo(() => {
    if (!selected) return [];
    return (messages || [])
      .filter(m => m.userId === selected)
      .sort((a, b) => new Date(a.date || a.id).getTime() - new Date(b.date || b.id).getTime());
  }, [messages, selected]);

  const selectedUser = useMemo(() => {
    if (!selected || selected === ALL_USERS) return null;
    return (users || []).find(u => u.id === selected) || null;
  }, [users, selected]);

  const countFor = (userId: string) => (messages || []).filter(m => m.userId === userId).length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length, selected]);

  const handleSend = async () => {
    const text = body.trim();
    if (!selected || !text) return;
    setSending(true);
    try {
      await sendMessage({
        id: crypto.randomUUID(),
        userId: selected,
        text,
        date: new Date().toISOString(),
        read: false,
        fromAdmin: true
      });
      // Só apaga o texto se a gravação realmente sucedeu — sendMessage
      // agora propaga erros, então uma falha do Firestore preserva o rascunho.
      setBody('');
    } catch (e: any) {
      alert('Falha ao enviar a mensagem. Seu texto foi preservado — tente reenviar.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-slideUp pb-20">
      {/* Header */}
      <div className="bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2 tracking-tight">
            <MessageSquare size={24} className="text-emerald-500" /> Comunicados &amp; Mensagens
          </h2>
          <p className="text-sm font-medium text-[var(--text-muted)] mt-1 ml-1">
            Envie comunicados aos familiares aprovados
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[var(--bg-main)] px-5 py-3 rounded-2xl border border-[var(--border-color)]">
          <Users size={18} className="text-[var(--text-muted)]" />
          <p className="text-xs font-semibold text-[var(--text-main)]">
            {familiares.length} familiares ativos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* LISTA DE FAMILIARES */}
        <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm overflow-hidden lg:sticky lg:top-24">
          <div className="p-5 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-3 bg-[var(--bg-main)] border-2 border-[var(--border-color)] focus-within:border-emerald-500 rounded-2xl px-4 py-2.5 transition-all">
              <Search size={16} className="text-[var(--text-muted)] shrink-0" />
              <input
                className="flex-1 bg-transparent border-none outline-none font-black text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                placeholder="BUSCAR FAMILIAR..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-[55vh] lg:max-h-[65vh] overflow-y-auto custom-scrollbar p-3 space-y-1">
            {/* Comunicado Geral */}
            <button
              onClick={() => setSelected(ALL_USERS)}
              className={`w-full rounded-2xl px-4 py-3 text-left transition-all flex items-center gap-3 border ${
                selected === ALL_USERS
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg'
                  : 'bg-[var(--bg-main)] text-[var(--text-main)] border-[var(--border-color)] hover:border-emerald-500/50'
              }`}
            >
              <Megaphone size={18} className={selected === ALL_USERS ? 'text-white' : 'text-amber-500'} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-black uppercase tracking-wide ${selected === ALL_USERS ? 'text-white' : 'text-[var(--text-main)]'}`}>
                  Todos os Familiares
                </p>
                <p className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${selected === ALL_USERS ? 'text-emerald-100' : 'text-[var(--text-muted)]'}`}>
                  Comunicado geral
                </p>
              </div>
              {countFor(ALL_USERS) > 0 && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selected === ALL_USERS ? 'bg-white/20 text-white' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}>
                  {countFor(ALL_USERS)}
                </span>
              )}
            </button>

            <div className="my-2 border-t border-dashed border-[var(--border-color)]"></div>

            {familiares.length === 0 ? (
              <div className="py-12 text-center px-4">
                <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {search ? 'Nenhum familiar encontrado' : 'Nenhum familiar aprovado ainda'}
                </p>
              </div>
            ) : (
              familiares.map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelected(u.id)}
                  className={`w-full rounded-2xl px-4 py-3 text-left transition-all flex items-center gap-3 border ${
                    selected === u.id
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg'
                      : 'bg-[var(--bg-main)] text-[var(--text-main)] border-[var(--border-color)] hover:border-emerald-500/50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center shrink-0 overflow-hidden">
                    <span className="font-black text-sm text-emerald-600">
                      {(u.name || '?').trim().charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black uppercase tracking-tight truncate ${selected === u.id ? 'text-white' : 'text-[var(--text-main)]'}`}>{u.name || '—'}</p>
                    <p className={`text-[9px] font-bold uppercase tracking-wider truncate mt-0.5 ${selected === u.id ? 'text-emerald-100' : 'text-[var(--text-muted)]'}`}>
                      {u.inmateName || u.prisonerName || 'Sem interno'} • {u.cpf || 'S/ CPF'}
                    </p>
                  </div>
                  {countFor(u.id) > 0 && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${selected === u.id ? 'bg-white/20 text-white' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}>
                      {countFor(u.id)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* CONVERSA */}
        <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm overflow-hidden flex flex-col">
          {!selected ? (
            <div className="p-16 text-center">
              <MessageSquare size={56} className="mx-auto mb-5 text-slate-300" />
              <p className="font-black uppercase tracking-[0.3em] text-[var(--text-main)]">Selecione um familiar</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-2">
                Escolha à esquerda para ver o histórico e enviar mensagens
              </p>
            </div>
          ) : (
            <>
              {/* Cabeçalho da conversa */}
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--bg-main)]/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                  {selected === ALL_USERS ? (
                    <Megaphone size={22} className="text-amber-500" />
                  ) : (
                    <span className="font-black text-lg text-emerald-600">{(selectedUser?.name || '?').trim().charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-sm uppercase tracking-tight truncate text-[var(--text-main)]">
                    {selected === ALL_USERS ? 'Todos os Familiares' : selectedUser?.name || 'Familiar'}
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mt-0.5 truncate">
                    {selected === ALL_USERS
                      ? `${familiares.length} destinatários aprovados`
                      : `${selectedUser?.inmateName || selectedUser?.prisonerName || 'Sem interno'} • ${selectedUser?.phone || selectedUser?.cpf || 'S/ contato'}`}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {thread.length} mensagens
                </span>
              </div>

              {/* Mensagens */}
              <div className="flex-1 min-h-[320px] max-h-[55vh] overflow-y-auto custom-scrollbar p-6 space-y-3">
                {thread.length === 0 ? (
                  <div className="py-16 text-center">
                    <Inbox size={36} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      Nenhuma mensagem enviada ainda
                    </p>
                  </div>
                ) : (
                  thread.map(msg => (
                    <div key={msg.id} className={`flex ${msg.fromAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] px-5 py-3.5 rounded-2xl shadow-sm ${
                          msg.fromAdmin
                            ? 'bg-emerald-600 text-white rounded-br-sm'
                            : 'bg-[var(--bg-main)] text-[var(--text-main)] border border-[var(--border-color)] rounded-bl-sm'
                        }`}
                      >
                        {!msg.fromAdmin && (
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Familiar</p>
                        )}
                        <p className="text-sm font-semibold leading-relaxed whitespace-pre-wrap break-words">{msg.text || (msg as any).message}</p>
                        <div className={`mt-1.5 flex items-center justify-end gap-2 ${msg.fromAdmin ? 'text-emerald-100' : 'text-[var(--text-muted)]'}`}>
                          <p className="text-[9px] font-bold uppercase tracking-wider">
                            {msg.date ? new Date(msg.date).toLocaleString('pt-BR') : (msg as any).createdAt ? new Date((msg as any).createdAt).toLocaleString('pt-BR') : ''}
                          </p>
                          {msg.fromAdmin && selected !== ALL_USERS && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/15">
                              {msg.read ? 'Lida' : 'Pendente'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Envio */}
              <div className="p-5 border-t border-[var(--border-color)] flex items-center gap-3">
                <input
                  className="flex-1 bg-[var(--bg-main)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl px-5 py-4 outline-none font-bold text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] transition-all shadow-inner"
                  placeholder={`Mensagem para ${selected === ALL_USERS ? 'todos os familiares' : (selectedUser?.name || 'o familiar')}...`}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !body.trim()}
                  className="px-8 py-4 bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
                >
                  <Send size={16} className={sending ? 'animate-pulse' : ''} /> {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};