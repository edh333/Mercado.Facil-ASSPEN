/**
 * Sistema de Pontos de Restauração (rollback local).
 * Faz um snapshot do estado do localStorage (configurações, chaves, cache, etc.)
 * permitindo voltar o sistema para uma data anterior caso algo dê errado.
 * Dados primários (Firestore) não são apagados por estas funções.
 */

export interface PontoRestauracao {
  id: string;
  label: string;
  createdAt: string; // ISO
  origin: 'auto' | 'manual';
  keys: Record<string, string>; // localStorage key -> value
}

const BACKUP_KEY = 'sistema_pontos_restauracao';
const MAX_BACKUPS = 15;

function lerPontos(): PontoRestauracao[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function gravarPontos(pontos: PontoRestauracao[]): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(pontos.slice(0, MAX_BACKUPS)));
  } catch {
    /* storage cheio — ignora silenciosamente */
  }
}

/** Coleta todas as chaves do localStorage (exceto a própria lista de backups). */
export function coletarEstadoLocal(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || key === BACKUP_KEY) continue;
    try {
      keys[key] = localStorage.getItem(key) || '';
    } catch {
      /* chave ilegível — ignora */
    }
  }
  return keys;
}

/** Cria um novo ponto de restauração com o estado atual do sistema. */
export function criarPontoRestauracao(label = 'Ponto de restauração', origin: 'auto' | 'manual' = 'manual'): PontoRestauracao {
  const ponto: PontoRestauracao = {
    id: `ponto-${Date.now()}`,
    label,
    createdAt: new Date().toISOString(),
    origin,
    keys: coletarEstadoLocal(),
  };
  gravarPontos([ponto, ...lerPontos()]);
  return ponto;
}

export function listarPontosRestauracao(): PontoRestauracao[] {
  return lerPontos();
}

/** Restaura o sistema para o estado salvo em um ponto (escreve localStorage e remove chaves extras). */
export function restaurarPontoRestauracao(id: string): { ok: boolean; error?: string } {
  const ponto = lerPontos().find((p) => p.id === id);
  if (!ponto) return { ok: false, error: 'Ponto de restauração não encontrado.' };
  try {
    const snapshotKeys = Object.keys(ponto.keys);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || key === BACKUP_KEY || snapshotKeys.includes(key)) continue;
      localStorage.removeItem(key);
    }
    Object.entries(ponto.keys).forEach(([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* chave individual falhou — continua */
      }
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro ao restaurar o ponto.' };
  }
}

export function excluirPontoRestauracao(id: string): void {
  gravarPontos(lerPontos().filter((p) => p.id !== id));
}

function baixarBlobJson(data: unknown, nome: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Baixa um ponto específico como arquivo JSON. */
export function baixarPontoRestauracao(id: string): void {
  const ponto = lerPontos().find((p) => p.id === id);
  if (!ponto) return;
  const data = new Date(ponto.createdAt);
  const nome = `ponto-restauracao-${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}.json`;
  baixarBlobJson(ponto, nome);
}

/** Baixa o estado completo do localStorage (backup geral). */
export function baixarBackupLocal(): void {
  const estado = coletarEstadoLocal();
  const data = new Date();
  const nome = `backup-completo-${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}.json`;
  baixarBlobJson({ exportadoEm: new Date().toISOString(), dados: estado }, nome);
}

/** Lê um arquivo JSON de ponto de restauração. */
export function importarPontoRestauracao(file: File): Promise<{ ok: boolean; error?: string; keys?: Record<string, string> }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object') {
          resolve({ ok: true, keys: parsed.keys });
        } else {
          resolve({ ok: false, error: 'Arquivo inválido: não é um ponto de restauração.' });
        }
      } catch {
        resolve({ ok: false, error: 'Arquivo corrompido ou inválido.' });
      }
    };
    reader.onerror = () => resolve({ ok: false, error: 'Falha ao ler o arquivo.' });
    reader.readAsText(file);
  });
}

/** Aplica um conjunto de chaves salvas ao localStorage. */
export function aplicarChavesLocal(keys: Record<string, string>): void {
  const snapshotKeys = Object.keys(keys);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || key === BACKUP_KEY || snapshotKeys.includes(key)) continue;
    localStorage.removeItem(key);
  }
  Object.entries(keys).forEach(([key, value]) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignora */
    }
  });
}

/**
 * Cria um backup automático diário (máx. 1 por dia).
 * Chamar no carregamento do painel administrativo.
 * Retorna true se criou um novo ponto.
 */
export function verificarBackupAutomatico(): boolean {
  try {
    const pontos = lerPontos();
    const hoje = new Date().toDateString();
    const jaExisteHoje = pontos.some((p) => new Date(p.createdAt).toDateString() === hoje);
    if (jaExisteHoje) return false;
    criarPontoRestauracao(`Automático — ${new Date().toLocaleDateString('pt-BR')}`, 'auto');
    return true;
  } catch {
    return false;
  }
}

export function formatarDataPonto(createdAt: string): string {
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return createdAt;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
