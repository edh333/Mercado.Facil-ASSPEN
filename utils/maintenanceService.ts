/**
 * SERVIÇO DE AUTO-MANUTENÇÃO — prolonga a vida útil do sistema rodando SOZINHO.
 *
 * Substitui a dependência dos scripts manuais (.bat) para a parte DENTRO do app:
 *  1) AUTOLIMPEZA     — chaves transitórias velhas, pontos de restauração excedentes.
 *  2) AUTORREPARO     — JSON corrompido vai para QUARENTENA (nunca é apagado sem cópia).
 *  3) SAÚDE           — conectividade, uso de armazenamento, fila offline, arquivamento.
 *
 * Princípios de segurança (NÃO NEGOCIÁVEIS):
 *  - NUNCA remove dado financeiro (vendas offline em erro ficam só como AVISO).
 *  - Toda reparação preserva o original com sufixo .corrompido.<timestamp>.
 *  - Operações pesadas rodam no máx. 1x por dia; verificação leve a cada 6h.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export interface ChecagemSaude {
  item: string;
  ok: boolean;
  detalhe: string;
}

export interface RelatorioManutencao {
  executadoEm: string;
  /** Ações efetivamente realizadas (remoções/quarentenas/podas). */
  limpezas: string[];
  /** Situações que precisam de atenção humana. */
  avisos: string[];
  saude: ChecagemSaude[];
  usoArmazenamentoPct: number | null;
}

const RELATORIO_KEY = 'sistema_relatorio_manutencao';
const GUARDA_DIARIA_KEY = 'sistema_manutencao_dia';
/** Chaves que SEMPRE devem conter JSON válido. */
const CHAVES_JSON = ['appSettings', 'mf_vendas_offline', 'pdv_suspended_carts', 'sistema_pontos_restauracao', 'printItem', 'printTicket'];
/** Cota típica do localStorage nos navegadores (5 MB). */
const COTA_ESTIMADA_BYTES = 5 * 1024 * 1024;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Uso aproximado do localStorage em % da cota típica. */
export function estimarUsoArmazenamento(storage: StorageLike): number | null {
  try {
    let bytes = 0;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k) continue;
      bytes += (k.length + (storage.getItem(k)?.length || 0)) * 2; // UTF-16 ≈ 2 bytes/char
    }
    return Math.min(100, Math.round((bytes / COTA_ESTIMADA_BYTES) * 100 * 10) / 10);
  } catch {
    return null;
  }
}

/**
 * AUTORREPARO: valida chaves conhecidas de JSON. Corrompida → copia para
 * `<chave>.corrompido.<ts>` e libera a chave original (o app reconstrói
 * com padrão/fila vazia em vez de quebrar em todo acesso).
 */
export function quarentenaDeJsonCorrompido(storage: StorageLike): string[] {
  const acoes: string[] = [];
  for (const chave of CHAVES_JSON) {
    let bruto: string | null = null;
    try {
      bruto = storage.getItem(chave);
    } catch {
      continue;
    }
    if (!bruto) continue;
    try {
      const parsed = JSON.parse(bruto);
      // Objeto/array são os únicos formatos esperados nessas chaves.
      if (parsed === null || typeof parsed !== 'object') throw new Error('formato inesperado');
    } catch {
      const destino = `${chave}.corrompido.${Date.now()}`;
      try {
        storage.setItem(destino, bruto);
        storage.removeItem(chave);
        acoes.push(`QUARENTENA: "${chave}" estava corrompida — original preservado em "${destino}".`);
      } catch {
        acoes.push(`AVISO GRAVE: "${chave}" corrompida e sem espaço para quarentena.`);
      }
    }
  }
  return acoes;
}

/**
 * AUTOLIMPEZA: o par printItem/printTicket é transitório (janela /print).
 * Se sobrou um item cujo documento tem mais de 48h, é lixo de sessão morta.
 */
export function limparImpressoesObsoletas(storage: StorageLike, maxHoras = 48): string[] {
  const acoes: string[] = [];
  try {
    const bruto = storage.getItem('printItem');
    if (!bruto) return acoes;
    const item = JSON.parse(bruto);
    const criadoEm = item?.data?.createdAt || item?.data?.date;
    const idadeHoras = criadoEm ? (Date.now() - new Date(criadoEm).getTime()) / 36e5 : null;
    if (idadeHoras === null || Number.isNaN(idadeHoras)) return acoes;
    if (idadeHoras > maxHoras) {
      storage.removeItem('printItem');
      storage.removeItem('printTicket');
      acoes.push(`LIMPEZA: impressão órfã de ${Math.round(idadeHoras)}h removida (printItem/printTicket).`);
    }
  } catch {
    /* conteúdo imprevisível — a quarentena de JSON cuida se for inválida */
  }
  return acoes;
}

/**
 * AUTOLIMPEZA: pontos de restauração são snapshots do localStorage; manter
 * muitos é caro (cada um guarda TODAS as chaves). Guarda só os mais recentes.
 */
export function podarPontosRestauracao(storage: StorageLike, manter = 8): string[] {
  const acoes: string[] = [];
  try {
    const bruto = storage.getItem('sistema_pontos_restauracao');
    if (!bruto) return acoes;
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista) || lista.length <= manter) return acoes;
    const excedente = lista.length - manter;
    storage.setItem('sistema_pontos_restauracao', JSON.stringify(lista.slice(0, manter)));
    acoes.push(`LIMPEZA: ${excedente} ponto(s) de restauração antigo(s) podado(s); ${manter} mais recentes mantidos.`);
  } catch {
    /* avaliado pela quarentena se inválido */
  }
  return acoes;
}

/** SAÚDE: roda todas as verificações passivas (não altera nada). */
export function verificarSaude(storage: StorageLike): { saude: ChecagemSaude[]; avisos: string[] } {
  const saude: ChecagemSaude[] = [];
  const avisos: string[] = [];

  // 1. Escrita/leitura do armazenamento local
  try {
    const sonda = '__sonda_manutencao__';
    storage.setItem(sonda, '1');
    const leu = storage.getItem(sonda) === '1';
    storage.removeItem(sonda);
    saude.push({ item: 'Armazenamento local', ok: leu, detalhe: leu ? 'Leitura e escrita OK' : 'Falha na verificação de escrita' });
  } catch {
    saude.push({ item: 'Armazenamento local', ok: false, detalhe: 'Indisponível ou cheio (modo privado?)' });
    avisos.push('localStorage indisponível — modo privado ou cota cheia. Vendas offline podem ser perdidas.');
  }

  // 2. Conectividade
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  saude.push({ item: 'Conectividade', ok: online, detalhe: online ? 'Online' : 'Offline (fila local ativa)' });

  // 3. Fila de vendas offline — DINHEIRO: só diagnostica, nunca mexe
  try {
    const fila = JSON.parse(storage.getItem('mf_vendas_offline') || '[]');
    const pendentes = Array.isArray(fila) ? fila.filter((v: any) => v?.status === 'pending').length : 0;
    const comErro = Array.isArray(fila) ? fila.filter((v: any) => v?.status === 'error').length : 0;
    saude.push({ item: 'Fila offline', ok: comErro === 0, detalhe: `${pendentes} pendente(s), ${comErro} com erro` });
    if (comErro > 0) avisos.push(`${comErro} venda(s) offline com erro aguardando revisão manual (não foram apagadas).`);
  } catch {
    avisos.push('Fila de vendas offline ilegível (tratada pela quarentena na próxima execução).');
  }

  // 4. Último arquivamento de dados (rotina dos 45 dias)
  try {
    const ultimo = storage.getItem('mercado_facil_last_archive');
    if (ultimo) {
      const dias = Math.floor((Date.now() - new Date(ultimo).getTime()) / 864e5);
      saude.push({ item: 'Arquivamento de dados', ok: true, detalhe: `Último há ${dias} dia(s) (ciclo de 45 dias)` });
    } else {
      saude.push({ item: 'Arquivamento de dados', ok: true, detalhe: 'Ainda não executado (normal em instalação nova)' });
    }
  } catch {
    /* informativo apenas */
  }

  return { saude, avisos };
}

/** Executa a manutenção completa. Idempotente e segura para rodar a qualquer momento. */
export function executarManutencao(storage: StorageLike = localStorage, forcar = false): RelatorioManutencao | null {
  // Guarda diária: pesado roda 1x/dia. `forcar` bypassa (uso pelo admin).
  try {
    if (!forcar && storage.getItem(GUARDA_DIARIA_KEY) === hoje()) {
      return lerUltimoRelatorio(storage);
    }
  } catch { /* segue */ }

  const limpezas: string[] = [
    ...quarentenaDeJsonCorrompido(storage),
    ...limparImpressoesObsoletas(storage),
    ...podarPontosRestauracao(storage),
  ];
  const { saude, avisos } = verificarSaude(storage);
  const uso = estimarUsoArmazenamento(storage);

  if (uso !== null && uso > 80) {
    avisos.push(`Armazenamento local em ${uso}% da cota — considere arquivar/exportar dados antigos.`);
  }

  const relatorio: RelatorioManutencao = {
    executadoEm: new Date().toISOString(),
    limpezas,
    avisos,
    saude,
    usoArmazenamentoPct: uso,
  };

  try {
    storage.setItem(RELATORIO_KEY, JSON.stringify(relatorio));
    storage.setItem(GUARDA_DIARIA_KEY, hoje());
  } catch { /* storage cheio — relatório fica só em memória */ }

  return relatorio;
}

export function lerUltimoRelatorio(storage: StorageLike = localStorage): RelatorioManutencao | null {
  try {
    const bruto = storage.getItem(RELATORIO_KEY);
    return bruto ? (JSON.parse(bruto) as RelatorioManutencao) : null;
  } catch {
    return null;
  }
}

/**
 * Agendador para o app: roda ao montar (se ainda não rodou hoje) e re-verifica
 * a cada 6h enquanto o sistema estiver aberto. Retorna função de limpeza.
 */
export function iniciarManutencaoAutomatica(storage: StorageLike = localStorage, intervaloMs = 6 * 60 * 60 * 1000): () => void {
  executarManutencao(storage);
  const timer = setInterval(() => executarManutencao(storage), intervaloMs);
  return () => clearInterval(timer);
}
