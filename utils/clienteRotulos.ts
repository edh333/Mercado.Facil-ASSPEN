// Fonte ÚNICA de verdade de QUAL nome é o destaque quando o sistema mostra
// "quem" numa venda. Regra do negócio:
//
//   O responsável (parente/familiar) é o TITULAR da compra — é quem tem a
//   carteira, quem paga, quem o operador escolhe na busca do PDV e quem o
//   servidor grava em orders.userName. Logo, é o nome que deve aparecer em
//   destaque.
//
//   O interno (preso) é o DESTINATÁRIO da mercadoria. É informação de
//   entrega e continua sendo exibida, porém como secundária.
//
// Antes desta regra, o nome do interno ocupava a linha de destaque no cupom
// térmico, no cupom de entrega e na lista da busca do PDV, enquanto o
// responsável — o titular da conta — ficava espremido num texto cinza pequeno.
// O operador buscava "Maria" evia com "José" em destaque, e o cupom confirmava.

/** Qualquer fonte que carregue os dois nomes — User, pedido ou linha de CSV. */
export interface FonteCliente {
  /** User.name (cadastro) ou Order.userName (pedido). */
  name?: string | null;
  userName?: string | null;
  /** Nome do pagador em lançamentos de carteira. */
  payerName?: string | null;
  /** User.inmateName ou Order.inmateName. */
  inmateName?: string | null;
  /** Alias legado do nome do interno. */
  prisonerName?: string | null;
  cpf?: string | null;
  userCpf?: string | null;
  inmateCpf?: string | null;
  prisonerCpf?: string | null;
}

export interface ClienteRotulado {
  /** Nome em DESTAQUE: o responsável pela compra. Vazio se não houver nenhum nome. */
  responsavel: string;
  /** CPF do responsável. Vazio quando desconhecido (nunca "***": a UI decide). */
  responsavelCpf: string;
  /** Nome do interno destinatário. Vazio quando é igual ao responsável. */
  interno: string;
  /** CPF do interno. Vazio quando o nome do interno foi suprimido por ser o mesmo. */
  internoCpf: string;
  /**
   * true quando não existe responsável cadastrado e o nome do interno subiu
   * para o destaque (conta sem parente, venda registrada no nome do interno).
   * A UI usa isso para rotular o nome em vez de mentir dizendo "familiar".
   */
  semResponsavel: boolean;
}

const primeiroNaoVazio = (...valores: (string | null | undefined)[]): string => {
  for (const v of valores) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

/**
 * Compara nomes ignorando caixa, acentos e espaços repetidos, para decidir se
 * responsável e interno são a mesma pessoa. Sem normalizar, "MARIA  SOUZA" e
 * "maria souza" seriam tratados como duas pessoas e o cupom imprimiria o mesmo
 * nome duas vezes seguidas.
 */
const mesmaPessoa = (a: string, b: string): boolean => {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  return !!a && !!b && norm(a) === norm(b);
};

/**
 * Resolve o par (responsável, interno) de qualquer fonte, já normalizado.
 *
 * Três garantias, para a tela nunca mostrar um campo em branco nem duplicado:
 *  1. sem responsável, o nome do interno assume o destaque (e `semResponsavel`
 *     avisa a UI para não rotular como "familiar");
 *  2. responsável e interno com o mesmo nome viram um nome só;
 *  3. quem some com o nome duplicado leva junto o CPF duplicado, salvo se o
 *     responsável não tiver CPF — aí o CPF do interno é preservado.
 */
export function rotularCliente(fonte: FonteCliente | null | undefined): ClienteRotulado {
  const f = fonte || {};

  const responsavelBruto = primeiroNaoVazio(f.name, f.userName, f.payerName);
  const internoBruto = primeiroNaoVazio(f.inmateName, f.prisonerName);
  const responsavelCpf = primeiroNaoVazio(f.cpf, f.userCpf);
  let internoCpf = primeiroNaoVazio(f.inmateCpf, f.prisonerCpf);

  // 1) responsible ausente: o interno vira o nome em destaque.
  if (!responsavelBruto && internoBruto) {
    const cpf = internoCpf;
    internoCpf = '';
    return {
      responsavel: internoBruto,
      responsavelCpf: cpf,
      interno: '',
      internoCpf: '',
      semResponsavel: true,
    };
  }

  // 2) mesmo nome: imprime uma vez só.
  if (mesmaPessoa(responsavelBruto, internoBruto)) {
    if (!responsavelCpf && internoCpf) return {
      responsavel: responsavelBruto,
      responsavelCpf: internoCpf,
      interno: '',
      internoCpf: '',
      semResponsavel: false,
    };
    return {
      responsavel: responsavelBruto,
      responsavelCpf,
      interno: '',
      internoCpf: '',
      semResponsavel: false,
    };
  }

  // 3) caso normal: os dois aparecem, cada um com o seu rótulo.
  return {
    responsavel: responsavelBruto,
    responsavelCpf,
    interno: internoBruto,
    internoCpf,
    semResponsavel: false,
  };
}
