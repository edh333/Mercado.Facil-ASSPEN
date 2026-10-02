// Classificação de erro na aprovação de depósito/pedido.
//
// O servidor já responde com a causa exata e já rejeita a duplicata de forma
// segura (o crédito nunca é liberado). O que faltava era essa causa chegar ao
// admin de forma útil: a tela mostrava "Erro ao aprovar: falha desconhecida" e
// fechava o modal, então ninguém sabia se era comprovante repetido, arquivo
// pequeno ou servidor fora.
//
// As regras são funções puras (sem React/Firebase) para serem testadas.

/** Motivos que o servidor devolve e que o admin precisa distinguir. */
export type MotivoAprovacao =
  | 'comprovante-duplicado'
  | 'comprovante-ausente'
  | 'comprovante-invalido'
  | 'sem-senha'
  | 'sessao-expirada'
  | 'sem-resposta'
  | 'ja-processado'
  | 'saldo-insuficiente'
  | 'indisponivel'
  | 'desconhecido';

export interface ResultadoAprovacao {
  motivo: MotivoAprovacao;
  /** Texto pronto para o admin: causa + o que fazer. Nunca genérico se há causa. */
  mensagem: string;
  /** true quando o depósito foi recusado por fraude (o servidor já marcou). */
  fraude: boolean;
  /** true quando vale tentar de novo (erro transitório). */
  transitorio: boolean;
  /** Código HttpsError, quando existir. */
  codigo?: string;
}

const ROTULO_CONFLITO = /outro dep[oó]sito|outro pedido|outra venda|j[aá] (utilizado|foi usado)/i;

/**
 * Extrai a mensagem real do erro do callable.
 * O Firebase embrulha como "(already-exists) Comprovante já utilizado...";
 * o prefixo do código precisa sair para sobrar a causa em português.
 */
export function mensagemDoErro(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e.trim();
  const anyE = e as { message?: unknown; details?: { message?: unknown }; code?: unknown };
  const bruto = String(anyE?.message ?? anyE?.details?.message ?? '').trim();
  if (!bruto) return '';
  // "(functions/already-exists) texto" -> "texto"
  const limpo = bruto.replace(/^\((?:functions\/)?[^)]*\)\s*/, '').trim();
  return limpo || bruto;
}

/** Interrompe o ciclo de tentativas quando o motivo não é culpa do operador. */
function classificar(e: unknown): ResultadoAprovacao {
  const msg = mensagemDoErro(e);
  const codigo = String((e as { code?: unknown })?.code ?? '').toLowerCase().replace(/^functions\//, '');
  const alvo = `${msg} ${codigo}`.toLowerCase();
  const mk = (motivo: MotivoAprovacao, mensagem: string, extra: Partial<ResultadoAprovacao> = {}): ResultadoAprovacao =>
    ({ motivo, mensagem, fraude: false, transitorio: false, codigo: codigo || undefined, ...extra });

  // ── Fraude / duplicidade: o servidor JÁ marcou como rejected ─────────────
  if (/already-exists/.test(codigo) || ROTULO_CONFLITO.test(msg)) {
    const id = /#\s*([A-Za-z0-9_-]{4,})/.exec(msg)?.[1];
    return {
      motivo: 'comprovante-duplicado',
      mensagem: `Comprovante já utilizado${id ? ` em outro depósito (#${id})` : ' em outra transação'}. Cada comprovante só pode ser usado uma vez — depósito recusado.`,
      fraude: true,
      transitorio: false,
      codigo: codigo || undefined,
    };
  }

  if (/comprovante n[aã]o enviado|sem comprovante|sem o comprovante/i.test(alvo)) {
    return mk('comprovante-ausente', 'Depósito sem comprovante válido. Peça a imagem ou o PDF completo do comprovante PIX.');
  }
  if (/muito pequeno|susp[eeto]|m[uí]nimo|fragmento|zip|ileg[ií]vel|n[aã]o p[oô]de ser lido|tamanho/i.test(alvo)) {
    return mk('comprovante-invalido', 'Comprovante inválido: arquivo muito pequeno ou corrompido. Peça o comprovante completo, legível.');
  }
  // Formato/MIME recusado. O servidor escreve com palavras no meio
  // ("Tipo de arquivo DE COMPROVANTE não permitido"), então em vez de listar
  // os preenchimentos usamos um wildcard curto entre o sujeito e o verbo.
  if (/(tipo|formato|extens[aã]o|mime|arquivo|anexo|upload)[\s\S]{0,40}?(n[aã]o (aceit[oa]|permitid[oa]|suportad[oa])|recusad[oa]|inv[aá]lid[oa])/i.test(alvo)
    || /s[oó] (imagem|pdf|foto)|apenas (imagem|pdf|foto)/i.test(alvo)) {
    return mk('comprovante-invalido', 'Formato de comprovante não aceito. Envie foto (JPG/PNG) ou PDF.');
  }
  if (/senha|c[oó]digo do administrador|autoriza[cç][aã]o|dupla senha/i.test(alvo)) {
    return mk('sem-senha', 'Autorização negada: a senha do administrador não foi validada no servidor. Tente novamente.');
  }
  if (/j[aá] foi processada|processada anteriormente|status.*pending|encerrad[oa]|cancelad[oa]/i.test(alvo)) {
    return mk('ja-processado', 'Esta transação já foi processada anteriormente e não pode ser aprovada de novo.');
  }
  if (/saldo insuficiente|sem cr[eé]dito|carteira/i.test(alvo)) {
    return mk('saldo-insuficiente', 'Saldo insuficiente para concluir a operação.');
  }
  if (/unauthenticated|permiss[aã]o|nao autenticado|sem permiss[aã]o|unauthorized/i.test(alvo)) {
    return mk('sessao-expirada', 'Sessão expirada ou sem permissão. Saia e entre novamente.');
  }

  // ── Transientes: vale tentar de novo ───────────────────────────────────
  if (/deadline|timeout|timed out/i.test(alvo)) {
    return { ...mk('sem-resposta', 'Servidor demorou para responder. Tente novamente em instantes.'), transitorio: true };
  }
  if (/unavailable|network|failed to fetch|fetch failed|conex[aã]o|offline|sem internet/i.test(alvo)) {
    return { ...mk('indisponivel', 'Sem conexão com o servidor. Verifique a internet e tente novamente.'), transitorio: true };
  }
  if (/internal|unavailable|500|502|503|504/i.test(alvo)) {
    return { ...mk('indisponivel', 'Servidor instável no momento. Tente novamente em instantes.'), transitorio: true };
  }
  if (/resource-exhausted|muitas tentativas|rate limit/i.test(alvo)) {
    return { ...mk('indisponivel', 'Muitas tentativas em pouco tempo. Aguarde 1 minuto e tente novamente.'), transitorio: true };
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  // O servidor preserva a causa real em PT-BR; se ela chegou, ela é a melhor
  // informação possível. Só quando NÃO veio nada é que se mostra genérico.
  if (msg && msg.length > 3) {
    return mk('desconhecido', msg);
  }
  return mk('desconhecido', 'Falha ao aprovar o depósito. Tente novamente.');
}

/**
 * @param e erro capturado (do callable ou do contexto)
 * @param acao o que o admin tentava fazer, para a mensagem fechar ("aprovação"/"recusa")
 */
export function explicarErroAprovacao(e: unknown, acao: 'aprovacao' | 'recusa' = 'aprovacao'): ResultadoAprovacao {
  const r = classificar(e);
  // A mensagem genérica é o ÚLTIMO recurso: quando o servidor mandou uma causa
  // em português ("Valor de depósito acima do teto..."), ela é sempre melhor
  // info que um texto genérico. Só troca quando realmente não veio nada.
  if (r.motivo === 'desconhecido') {
    const msg = mensagemDoErro(e);
    if (msg && msg.length > 3) return r;
    return { ...r, mensagem: `Falha ao ${acao === 'recusa' ? 'recusar' : 'aprovar'} a operação. Tente novamente.` };
  }
  return r;
}