// Versão e atualização do aplicativo.
//
// Contexto (motivo deste módulo): o app desktop NÃO se auto-atualiza — quem
// instalou continua na versão antiga até baixar um novo instalador. Isso já
// gerou bug real em campo: um PC com a build antiga mostrava o nome do FAMILIAR
// na busca do PDV (corrigido depois para destacar o PRESO) e rodava mais lento
// (sem o carregamento sob demanda dos painéis), enquanto o navegador — sempre
// servido atualizado — funcionava bem.
//
// Aqui centralizamos: obter a versão LOCAL (a instalada) e a versão PUBLICADA
// (manifest público), para a interface avisar o operador de forma clara.
//
// No Electron usamos os canais IPC do main (versão real do executável e
// consulta do manifest). No navegador não há "versão instalada" — a página é
// sempre a mais recente — então apenas lemos o manifest para exibir ao usuário.

// Manifest público de versões (mesmo usado pelo aviso automático do desktop).
const MANIFEST_URL =
  'https://firebasestorage.googleapis.com/v0/b/mercado-facil-mt.firebasestorage.app/o/apps%2Fversion.json?alt=media';

export const URL_WEB_OFICIAL = 'https://mercado-facil-mt.web.app';

export interface VersaoPublicada {
  version: string;
  releasedAt?: string;
  webUrl?: string;
}

export interface InfoAtualizacao {
  /** true = executável desktop (Electron); false = navegador/web. */
  desktop: boolean;
  /** Versão instalada do executável (vazia no navegador). */
  versaoLocal: string;
  /** Versão mais recente publicada (null se não foi possível consultar). */
  publicada: VersaoPublicada | null;
  /** true somente quando há versão publicada mais nova que a instalada. */
  updateAvailable: boolean;
}

/** Compara versões no formato "1.2.3" (aceita quantidades diferentes de partes). */
export function compararVersoes(a: string, b: string): number {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const tam = Math.max(pa.length, pb.length);
  for (let i = 0; i < tam; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va > vb ? 1 : -1;
  }
  return 0;
}

/** Lê o manifest público de versões via fetch (navegador). */
export async function buscarVersaoPublicada(): Promise<VersaoPublicada | null> {
  try {
    const res = await fetch(`${MANIFEST_URL}&t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.version) return null;
    return { version: String(json.version), releasedAt: json.releasedAt, webUrl: json.webUrl };
  } catch {
    return null;
  }
}

/**
 * Estado de atualização pronto para a UI. No Electron delega ao main (versão
 * real do executável + consulta do manifest); no navegador apenas lê o manifest.
 */
export async function verificarAtualizacao(): Promise<InfoAtualizacao> {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;

  if (api?.checkUpdate) {
    try {
      const r = await api.checkUpdate();
      if (r && typeof r.updateAvailable === 'boolean') {
        return {
          desktop: true,
          versaoLocal: String(r.current || ''),
          publicada: r.latest
            ? { version: String(r.latest), webUrl: r.webUrl, releasedAt: r.releasedAt }
            : null,
          updateAvailable: !!r.updateAvailable,
        };
      }
    } catch {
      /* cai para o caminho web abaixo */
    }
  }

  const publicada = await buscarVersaoPublicada();
  return { desktop: false, versaoLocal: '', publicada, updateAvailable: false };
}

/** Abre a página oficial de download (no desktop, via shell do Electron). */
export function abrirPaginaDownload(webUrl?: string): void {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
  if (api?.openUpdate) {
    try {
      api.openUpdate(webUrl);
      return;
    } catch {
      /* segue para window.open */
    }
  }
  window.open(webUrl || URL_WEB_OFICIAL, '_blank', 'noopener');
}
