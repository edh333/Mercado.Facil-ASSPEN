import { mascararCpf } from '../utils';

export function formatarLinhaDupla(esquerda: string, direita: string, larguraTotal = 40): string {
  if (esquerda.length + direita.length > larguraTotal) {
    // NUNCA estoura a coluna da bobina: rótulos longos são truncados à esquerda
    // (o valor à direita é mantido inteiro). Sem isso a térmica quebrava a linha
    // no meio e desalinhavam o cupom inteiro a partir daquela linha.
    const espacoMax = Math.max(1, larguraTotal - 1 - direita.length);
    esquerda = esquerda.slice(0, espacoMax);
  }
  const espacosNecessarios = Math.max(0, larguraTotal - (esquerda.length + direita.length));
  return esquerda + " ".repeat(espacosNecessarios) + direita;
}

/** Linha com pontilhado entre rótulo e valor (padrão de cupom fiscal). */
export function formatarLinhaPontilhada(esquerda: string, direita: string, larguraTotal = 40): string {
  if (esquerda.length + direita.length > larguraTotal - 1) {
    // Rótulo longo (ex.: nome do 2º devedor em venda em dupla) não pode empurrar
    // a linha além da largura — trunca à esquerda, mantendo o valor inteiro.
    const espacoMax = Math.max(1, larguraTotal - 1 - direita.length);
    esquerda = esquerda.slice(0, espacoMax);
  }
  // dois espaços (um de cada lado dos pontos) — nunca estoura a largura
  const pontos = Math.max(1, larguraTotal - esquerda.length - direita.length - 2);
  return esquerda + " " + ".".repeat(pontos) + " " + direita;
}

/** Centraliza um texto na largura da bobina (cabeçalhos, banners, rodapé). */
export function centrarTexto(texto: string, larguraTotal = 48): string {
  const t = String(texto ?? '').trim();
  if (t.length >= larguraTotal) return t.slice(0, larguraTotal);
  const total = larguraTotal - t.length;
  const esq = Math.floor(total / 2);
  return ' '.repeat(esq) + t + ' '.repeat(total - esq);
}

const ESC = "\x1B";
const GS = "\x1D";

// Tabela PC850 (Multilingual Latin-1) — a codepage de facto para térmicas
// brasileiras. Texto UTF-8 cru (TextEncoder) sai corrompido (ï¿½) em
// impressoras single-byte; aqui cada caractere acentuado vira o byte certo.
// Caracteres sem mapeamento viram '?' (nunca quebram o fluxo do cupom).
const CP850: Record<string, number> = {
  'Ç': 0x80, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87,
  'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'Ä': 0x8E,
  'Å': 0x8F, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95,
  'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, 'ü': 0x81, '¢': 0x9B, '£': 0x9C,
  '¥': 0x9D, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5,
  'ª': 0xA6, 'º': 0xA7, '¿': 0xA8, '®': 0xA9, '¬': 0xAA, '½': 0xAB, '¼': 0xAC,
  '¡': 0xAD, '«': 0xAE, '»': 0xAF, 'Á': 0xB5, 'Â': 0xB6, 'À': 0xB7, '©': 0xB8,
  'ã': 0xC6, 'Ã': 0xC7, '¤': 0xCF, 'ð': 0xD0, 'Ð': 0xD1, 'Ê': 0xD2, 'Ë': 0xD3,
  'È': 0xD4, 'Í': 0xD6, 'Î': 0xD7, 'Ï': 0xD8, '¦': 0xDD, 'Ì': 0xDE, 'Ó': 0xE0,
  'ß': 0xE1, 'Ô': 0xE2, 'Ò': 0xE3, 'õ': 0xE4, 'Õ': 0xE5, 'µ': 0xE6, 'Ú': 0xE9,
  'Û': 0xEA, 'Ù': 0xEB, 'ý': 0xEC, 'Ý': 0xED, '¯': 0xEE, '´': 0xEF, '±': 0xF1,
  '¾': 0xF3, '¶': 0xF4, '§': 0xF5, '÷': 0xF6, '¸': 0xF7, '°': 0xF8, '¨': 0xF9,
  '¹': 0xFA, '³': 0xFB, '²': 0xFC, '■': 0xFD,
};

function codificarCp850(texto: string): number[] {
  const bytes: number[] = [];
  for (const ch of texto) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) { bytes.push(code); continue; }
    const mapeado = CP850[ch];
    bytes.push(mapeado ?? 0x3F);
  }
  return bytes;
}

/**
 * Gera a sequência binária ESC/POS do cupom (padrão 80mm / 48 colunas):
 * INIT → codepage (PC850/PC860) → Fonte A → alinhamento → texto → avanço de
 * papel (guilhotina) → corte PARCIAL (padrão; não "engole" a última linha) →
 * abertura de gaveta (opcional).
 * Retorna a string em base64 pronta para o QZ Tray (formato 'raw'/'base64').
 */
export function montarEscPos(texto: string, config?: any): string {
  const cortar = config?.autoCutPaper !== false;
  const cutMode = config?.cutMode === 'full' ? 'full' : 'partial';
  const gaveta = config?.drawerKick === true;
  const feeds = Math.max(2, Math.min(10, Number(config?.endFeedLines || 4)));
  const codepage = String(config?.codepage || '850'); // '850' | '860' | 'utf8'

  const bytes: number[] = [];
  const push = (s: string | number[]) =>
    Array.isArray(s) ? bytes.push(...s) : bytes.push(...Array.from(s).map(c => c.charCodeAt(0)));
  const pushTexto = (s: string) =>
    push(codepage === 'utf8' ? Array.from(new TextEncoder().encode(s)) : codificarCp850(s));

  push(ESC + "@");                                            // INIT — reset completo
  if (codepage !== 'utf8') {
    push(ESC + "t" + (codepage === '860' ? "\x03" : "\x02")); // codepage: PC860 ou PC850
  }
  push(ESC + "M" + "\x00");                                   // Fonte A (48 colunas)
  push(ESC + "a" + "\x00");                                   // alinhamento à esquerda
  pushTexto(texto);                                           // conteúdo do cupom
  push(ESC + "d" + String.fromCharCode(feeds));               // avanço de papel (guilhotina)
  if (cortar) {
    if (cutMode === 'full') {
      push(GS + "V" + "A" + "\x00");                          // corte TOTAL + alimenta
    } else {
      push(GS + "V" + "\x01");                                // corte PARCIAL (padrão)
    }
  }
  if (gaveta) push(ESC + "p" + "\x00" + "\x19" + "\x32");     // abre gaveta (pin 2)
  return btoa(String.fromCharCode(...bytes));
}

function adicionarFeed(): string {
  return "\n".repeat(8);
}

export function gerarCupomFechamento(dadosCaixa: any, config?: any): string {
  const divisor = "-".repeat(40);
  const divisorDuplo = "=".repeat(40);

  const inst = String(config?.institutionName || 'MERCADO FACIL PDV').slice(0, 40).toUpperCase();
  const appName = String(config?.appName || '').slice(0, 40).toUpperCase();
  const cnpj = String(config?.cnpj || '').trim().toUpperCase().slice(0, 18);

  let cupom = "";
  cupom += `========================================\n`;
  cupom += `${centrarTexto(inst, 40)}\n`;
  if (appName) cupom += `${centrarTexto(appName, 40)}\n`;
  if (cnpj) cupom += `${centrarTexto(`CNPJ: ${cnpj}`, 40)}\n`;
  cupom += `========================================\n\n`;

  function dataCx(valor?: any): string {
    if (!valor) return '—';
    try {
      const d = typeof (valor as any)?.toDate === 'function' ? (valor as any).toDate() : new Date(valor);
      return d.toLocaleString('pt-BR');
    } catch {
      return '—';
    }
  }

  cupom += `${centrarTexto('RELATORIO GERENCIAL DE CAIXA', 40)}\n\n`;
  cupom += `Operador: ${dadosCaixa.operadorNome || dadosCaixa.operatorId}\n`;  cupom += `Abertura: ${dataCx(dadosCaixa.openedAt)}\n`;
  if (dadosCaixa.closedAt) {
    cupom += `Fechamento: ${dataCx(dadosCaixa.closedAt)}\n`;
  }
  if (dadosCaixa.closedByName) {
    cupom += `Fechado por: ${String(dadosCaixa.closedByName).slice(0, 36)}\n`;
  }
  cupom += `${divisor}\n`;

  cupom += formatarLinhaDupla("Saldo Inicial:", `R$ ${Math.abs(Number(dadosCaixa.initialBalance)).toFixed(2)}`) + "\n";
  cupom += formatarLinhaDupla("Faturamento (Sistema):", `R$ ${Math.abs(Number(dadosCaixa.expectedBalance)).toFixed(2)}`) + "\n";
  cupom += formatarLinhaDupla("Valor Contado:", `R$ ${Math.abs(Number(dadosCaixa.closedBalance)).toFixed(2)}`) + "\n";
  cupom += `${divisor}\n`;

  const diferenca = Number(dadosCaixa.cashDifference || 0);
  if (diferenca === 0) {
    cupom += `   >>> CAIXA FECHADO SEM QUEBRAS <<<   \n`;
  } else if (diferenca < 0) {
    cupom += formatarLinhaDupla("QUEBRA DE CAIXA (FALTA):", `R$ ${Math.abs(diferenca).toFixed(2)}`) + "\n";
  } else {
    cupom += formatarLinhaDupla("SOBRA DE CAIXA:", `R$ ${Math.abs(diferenca).toFixed(2)}`) + "\n";
  }

  const hora = new Date().toLocaleString("pt-BR");
  cupom += `${divisor}\n`;
  cupom += `Emissao: ${hora}\n`;
  if (cnpj) cupom += `CNPJ: ${cnpj}\n`;
  cupom += `${divisorDuplo}\n`;
  cupom += `${adicionarFeed()}`;
  return cupom;
}

/**
 * Injeta um container invisível com o conteúdo formatado e dispara window.print().
 * O container é removido automaticamente após a impressão (ou após 5s timeout).
 */
export function imprimirCupom(conteudo: string): void {
  const existing = document.querySelector('.cupom-gerencial-print');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'print-root';
  container.className = 'cupom-gerencial-print guilhotina';
  const pre = document.createElement('pre');
  pre.textContent = (conteudo + adicionarFeed()).toUpperCase(); // Garantir caps para impressoras térmicas
  container.appendChild(pre);
  document.body.appendChild(container);

  const limpar = () => {
    const el = document.querySelector('.cupom-gerencial-print');
    if (el) el.remove();
    window.removeEventListener('afterprint', limpar);
  };

  window.addEventListener('afterprint', limpar);
  setTimeout(limpar, 5000);
  setTimeout(() => { window.print(); }, 150);
}

/**
 * Formata uma lista de produtos para impressão de reposição de estoque.
 */
export function gerarListaReposicao(produtos: { nome: string; estoque: number; minimo: number; qtdComprar: number }[]): string {
  const divisor = "-".repeat(40);

  let texto = "";
  texto += `========================================\n`;
  texto += `${centrarTexto('LISTA DE REPOSICAO DE ESTOQUE', 40)}\n`;
  texto += `========================================\n`;
  texto += `Data: ${new Date().toLocaleDateString("pt-BR")}\n`;
  texto += `${divisor}\n\n`;

  texto += `${"PRODUTO".padEnd(22)}${"EST".padStart(5)}${"MIN".padStart(5)}${"COMPRAR".padStart(8)}\n`;
  texto += `${divisor}\n`;

  for (const p of produtos) {
    const nome = p.nome.length > 22 ? p.nome.substring(0, 19) + '...' : p.nome;
    texto += `${nome.padEnd(22)}${String(p.estoque).padStart(5)}${String(p.minimo).padStart(5)}${String(p.qtdComprar).padStart(8)}\n`;
  }

  texto += `\n${divisor}\n`;
  texto += `Total de itens: ${produtos.length}\n`;
  texto += `========================================\n`;
  texto += `${centrarTexto('FIM DA LISTA DE REPOSICAO', 40)}\n`;
  texto += `${adicionarFeed()}`;

  return texto;
}

/**
 * Gera cupom de 80mm com a listagem de créditos dos usuários.
 * @param usuarios Lista de usuários (já filtrados pela tela)
 * @param apenasComSaldo true → relatório de ativos com saldo; false → zerados/inativos
 * @param titulo Título customizado (ex.: consulta individual por CPF/UID)
 */
export function gerarRelatorioCredito(usuarios: { name: string; cpf: string; id: string; walletBalance: number; status: string }[], apenasComSaldo: boolean, titulo?: string): string {  const divisor = "-".repeat(40);
  const tituloFinal = titulo || (apenasComSaldo ? "CREDITOS ATIVOS (COM SALDO)" : "CREDITOS ZERADOS (SEM SALDO)");

  let texto = "";
  texto += `========================================\n`;
  texto += `${centrarTexto('RELATORIO DE CREDITOS', 40)}\n`;
  texto += `========================================\n`;
  texto += `Data: ${new Date().toLocaleDateString("pt-BR")}\n`;
  texto += `${tituloFinal}\n`;
  texto += `Registros: ${usuarios.length}\n`;
  texto += `${divisor}\n\n`;

  texto += `${"CLIENTE".padEnd(18)}${"CPF".padStart(11)}${"SALDO".padStart(11)}\n`;
  texto += `${divisor}\n`;

  let totalGeral = 0;
  for (const u of usuarios) {
    const nome = (u.name || '—').length > 18 ? (u.name || '—').substring(0, 15) + '...' : (u.name || '—');
    const cpf = mascararCpf(u.cpf);
    const saldo = (u.walletBalance || 0).toFixed(2).replace('.', ',');
    texto += `${nome.padEnd(18)}${cpf.padStart(11)}${String("R$ " + saldo).padStart(11)}\n`;
    if (titulo && u.id) {
      texto += `${("UID: " + u.id.toUpperCase()).slice(0, 40)}\n`;
    }
    totalGeral += (u.walletBalance || 0);
  }

  texto += `\n${divisor}\n`;
  texto += formatarLinhaDupla("TOTAL EM CREDITOS:", `R$ ${totalGeral.toFixed(2).replace('.', ',')}`) + "\n";
  texto += `========================================\n`;
  texto += `${centrarTexto('FIM DO RELATORIO DE CREDITOS', 40)}\n`;
  texto += `${adicionarFeed()}`;

  return texto;
}

/**
 * Impressão A4 profissional do relatório de créditos (lista já filtrada pela tela).
 * Abre uma janela de impressão com cabeçalho institucional, resumo, tabela
 * numerada com totais, rodapé e campos de assinatura.
 */
export function imprimirRelatorioCreditoA4(
  usuarios: { name: string; cpf: string; id: string; walletBalance: number; status: string }[],
  titulo: string,
  settings?: any,
  subtitulo?: string
): void {
  const instituicao = settings?.institutionName || settings?.appName || 'MERCADO FÁCIL';
  const documento = settings?.customReceiptDocName || 'RELATÓRIO DE CRÉDITOS — NÃO FISCAL';
  const hoje = new Date().toLocaleDateString('pt-BR');
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const lista = [...usuarios].sort((a, b) => Number(b.walletBalance || 0) - Number(a.walletBalance || 0));
  const comSaldo = lista.filter(x => Number(x.walletBalance || 0) > 0).length;
  const semSaldo = lista.filter(x => Number(x.walletBalance || 0) <= 0).length;
  const totalSaldo = lista.reduce((s, x) => s + Number(x.walletBalance || 0), 0);

  const linha = lista.map((x, i) => `
            <tr>
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${String(i + 1).padStart(2, '0')}</td>
                <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;">${String(x.name || '—').replace(/</g, '&lt;')}</td>
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-family:monospace;">${String(mascararCpf(x.cpf)).replace(/</g, '&lt;')}</td>
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${x.status === 'active' ? 'Ativo' : x.status === 'pending' ? 'Pendente' : 'Suspenso'}</td>
                <td style="text-align:right;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:800;color:${Number(x.walletBalance || 0) > 0 ? '#059669' : '#94a3b8'};">R$ ${Number(x.walletBalance || 0).toFixed(2).replace('.', ',')}</td>
            </tr>`).join('');

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${titulo}</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #059669; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:20px; text-transform:uppercase; letter-spacing:1px; color:#059669; }
    .cabecalho p { font-size:12px; color:#64748b; margin-top:4px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    .cards { display:flex; gap:12px; margin-bottom:22px; }
    .card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
    .card p.titulo { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; }
    .card p.valor { font-size:18px; font-weight:800; color:#059669; }
    .card p.valor.slate { color:#0f172a; }
    table { width:100%; border-collapse:collapse; }
    thead th { background:#0f172a; color:#fff; padding:10px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    tfoot td { padding:10px; font-weight:800; font-size:12px; background:#f8fafc; border-top:2px solid #0f172a; }
    .criterio { margin-top:14px; padding:10px 14px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; font-size:10px; color:#047857; text-transform:uppercase; letter-spacing:1px; font-weight:700; }
    .rodape { margin-top:22px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    .assinatura { margin-top:56px; display:flex; justify-content:space-between; }
    .assinatura div { width:40%; border-top:1px solid #64748b; padding-top:8px; font-size:10px; text-transform:uppercase; text-align:center; color:#475569; }
    @media print { body { padding:16px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>${titulo}</h1>
            <p>${instituicao} — ${documento}</p>
            <p style="font-size:11px;color:#94a3b8;margin-top:6px;">${subtitulo || 'Gestão de créditos dos familiares'}</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje} às ${hora}</b></p>
            <p>${lista.length} registro(s) na listagem</p>
        </div>
    </div>
    <div class="cards">
        <div class="card"><p class="titulo">Total em Créditos</p><p class="valor">R$ ${totalSaldo.toFixed(2).replace('.', ',')}</p></div>
        <div class="card"><p class="titulo">Com Saldo</p><p class="valor">${comSaldo}</p></div>
        <div class="card"><p class="titulo">Sem Saldo</p><p class="valor slate">${semSaldo}</p></div>
        <div class="card"><p class="titulo">Saldo Médio</p><p class="valor">R$ ${lista.length ? (totalSaldo / lista.length).toFixed(2).replace('.', ',') : '0,00'}</p></div>
    </div>
    <table>
        <thead>
            <tr>
                <th style="width:36px;">#</th>
                <th>Familiar</th>
                <th style="width:140px;text-align:center;">CPF</th>
                <th style="width:90px;text-align:center;">Status</th>
                <th style="width:120px;text-align:right;">Saldo Disponível</th>
            </tr>
        </thead>
        <tbody>${linha}</tbody>
        <tfoot>
            <tr>
                <td colspan="4" style="text-align:right;">TOTAL DE ${lista.length} FAMILIARES</td>
                <td style="text-align:right;color:#059669;">R$ ${totalSaldo.toFixed(2).replace('.', ',')}</td>
            </tr>
        </tfoot>
    </table>
    <div class="criterio">Critério da listagem: ${subtitulo || 'todos os familiares cadastrados'}</div>
    <div class="rodape">Documento emitido pelo sistema Mercado Fácil — não é comprovante fiscal.</div>
    <div class="assinatura">
        <div>Responsável pela Emissão</div>
        <div>Direção / Administração</div>
    </div>
</body>
</html>`;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { try { printWindow.print(); } catch { /* janela fechada */ } }, 500);
}

/**
 * Gera cupom de 80mm com lista de clientes inadimplentes ou com saldo devedor.
 * Inclui ANTIGUIDADE da dívida (dias desde a última movimentação na conta)
 * e resumo por faixa — prioriza a cobrança do que está mais velho.
 */
export function gerarRelatorioInadimplentes(contas: any[]): string {
  const divisor = "-".repeat(40);
  const hoje = Date.now();
  const DIA = 24 * 60 * 60 * 1000;

  const diasSemMovimento = (c: any): number | null => {
    const ts = (Array.isArray(c?.transactions) ? c.transactions : [])
      .map((t: any) => t?.timestamp)
      .filter(Boolean)
      .map((v: any) => (typeof v?.toDate === 'function' ? v.toDate().getTime() : new Date(v).getTime()))
      .filter((n: number) => Number.isFinite(n));
    if (ts.length === 0) return null;
    return Math.max(0, Math.floor((hoje - Math.max(...ts)) / DIA));
  };

  const devedores = contas
    .filter(c => (c.currentDebt || 0) > 0)
    .map(c => ({ ...c, _dias: diasSemMovimento(c) }))
    .sort((a, b) => b.currentDebt - a.currentDebt);

  // Resumo por antiguidade (conta sem movimento registrado entra na faixa crítica)
  const faixas = [
    { rotulo: 'ATE 15 DIAS', teste: (d: number | null) => d !== null && d <= 15 },
    { rotulo: 'DE 16 A 30 DIAS', teste: (d: number | null) => d !== null && d >= 16 && d <= 30 },
    { rotulo: 'MAIS DE 30 DIAS', teste: (d: number | null) => d === null || d > 30 },
  ];
  const resumoFaixas = faixas.map(f => {
    const noFaixa = devedores.filter(c => f.teste(c._dias));
    return {
      rotulo: f.rotulo,
      qtd: noFaixa.length,
      total: noFaixa.reduce((s, c) => s + (Number(c.currentDebt) || 0), 0),
    };
  });

  let texto = "";
  texto += `========================================\n`;
  texto += `${centrarTexto('RELATORIO DE INADIMPLENCIA', 40)}\n`;
  texto += `========================================\n`;
  texto += `Data: ${new Date().toLocaleDateString("pt-BR")}\n`;
  texto += `Clientes com debito: ${devedores.length}\n`;
  texto += `${divisor}\n`;
  texto += `ANTIGUIDADE DAS DIVIDAS\n`;
  for (const r of resumoFaixas) {
    texto += `${(r.rotulo + ' ').padEnd(18, '.')} ${String(r.qtd).padStart(3)}x R$ ${r.total.toFixed(2).replace('.', ',').padStart(9)}\n`;
  }
  texto += `${divisor}\n`;

  let totalGeral = 0;
  for (const c of devedores) {
    const nome = c.nome.length > 25 ? c.nome.substring(0, 22) + '...' : c.nome;
    const valor = (c.currentDebt || 0).toFixed(2).replace('.', ',');
    texto += `${nome.padEnd(25)}${String("R$ " + valor).padStart(15)}\n`;
    if (c._dias !== null) {
      texto += `  ${c._dias > 30 ? '*** ' : '    '}ha ${c._dias} dia(s) sem movimento\n`;
    } else {
      texto += `      *** sem movimento registrado\n`;
    }
    totalGeral += (c.currentDebt || 0);
  }

  texto += `\n${divisor}\n`;
  texto += formatarLinhaDupla("TOTAL A RECEBER:", `R$ ${totalGeral.toFixed(2).replace('.', ',')}`) + "\n";
  texto += `========================================\n`;
  texto += `${centrarTexto('FIM DO RELATORIO FINANCEIRO', 40)}\n`;
  texto += `${adicionarFeed()}`;

  return texto;
}

/**
 * Gera o texto cru (raw) do cupom de entrega em 48 colunas,
 * pronto para impressora térmica bobina (Tectoy/ESC/POS ou QZ Tray).
 * Layout profissional: cabeçalho institucional (CNPJ/telefone), localização,
 * itens com preço unitário, formas de pagamento (inclusive mistas), troco,
 * saldo atual, chave PIX e selo de cancelamento para cupons estornados.
 */
export function gerarCupomEntregaRaw(venda: any, config?: any): string {
  const data = venda || {};
  const itens = data.items || data.itens || [];
  const divisor = "-".repeat(48);
  const divisorDuplo = "=".repeat(48);

  const limparLinha = (v: any, max = 48) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().toUpperCase().slice(0, max);

  const inst = limparLinha(config?.institutionName || config?.appName || 'MERCADO FACIL');
  const app = limparLinha(config?.appName || 'MERCADO FACIL');
  const fiscalEmission = config?.fiscalEmission === true;
  const docName = limparLinha(
    config?.customReceiptDocName ||
    (fiscalEmission ? `CUPOM FISCAL - ${String(config?.fiscalModel || 'NF-E')}` : 'CUPOM DE ENTREGA - NAO FISCAL')
  );
  // Só monta o número fiscal se houver número configurado — evita "N000000000"
  // e "SERIE " vazios em cupons fiscais sem numeração cadastrada.
  const fiscalId = fiscalEmission && config?.fiscalNumber
    ? limparLinha(
        `${String(config?.fiscalModel || 'NF-E')} N${String(config?.fiscalNumber || '').padStart(9, '0')}` +
        (config?.fiscalSeries ? `  SERIE ${String(config?.fiscalSeries).toUpperCase()}` : ''),
        48
      )
    : '';
  const cnpj = limparLinha(config?.cnpj || '', 18);
  const telefone = limparLinha(config?.contactPhone || '', 18);
  const endereco = limparLinha(config?.address || '', 44);

  const status = String(data.status || '').toLowerCase();
  const cancelado = ['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'rejected', 'rejeitado'].includes(status);

  let cupom = "";
  cupom += `${divisorDuplo}\n`;
  // Cabeçalho centralizado (padrão térmico profissional)
  cupom += `${centrarTexto(inst, 48)}\n`;
  if (app && app !== inst) cupom += `${centrarTexto(app, 48)}\n`;
  if (cnpj) cupom += `${centrarTexto(`CNPJ: ${cnpj}`, 48)}\n`;
  if (endereco) cupom += `${centrarTexto(endereco, 48)}\n`;
  if (telefone) cupom += `${centrarTexto(`TEL: ${telefone}`, 48)}\n`;
  cupom += `${centrarTexto(docName, 48)}\n`;
  if (!fiscalEmission) cupom += `${centrarTexto('NAO E DOCUMENTO FISCAL', 48)}\n`;
  if (fiscalId) cupom += `${centrarTexto(fiscalId, 48)}\n`;
  cupom += `${divisorDuplo}\n`;

  if (cancelado) {
    cupom += `\n${centrarTexto('* CUPOM CANCELADO / DEVOLVIDO *', 48)}\n\n`;
    cupom += `${divisor}\n`;
  }

  const dataCriacao = data.createdAt || data.date || data.data;
  // Aceita ISO string, Date ou Firestore Timestamp legado ({seconds}); nunca imprime "Invalid Date".
  const dtNormalizado = (() => {
    if (!dataCriacao) return new Date();
    if (typeof dataCriacao === 'object' && 'seconds' in (dataCriacao as any)) return new Date((dataCriacao as any).seconds * 1000);
    const d = new Date(dataCriacao as any);
    return isNaN(d.getTime()) ? new Date() : d;
  })();
  const dt = dtNormalizado.toLocaleString("pt-BR");
  cupom += formatarLinhaDupla("DATA:", dt, 48) + "\n";
  cupom += formatarLinhaDupla("ID:", `#${String(data.id || '---').slice(0, 12).toUpperCase()}`, 48) + "\n";
  cupom += formatarLinhaDupla("OPER:", String(data.operatorName || 'ADMIN').toUpperCase().slice(0, 15), 48) + "\n";
  if (data.unitName) {
    cupom += formatarLinhaDupla("UNIDADE:", limparLinha(data.unitName, 22), 48) + "\n";
  }
  cupom += `${divisor}\n`;

  const interno = data.inmateName || data.prisonerName;
  const inmateCpf = data.inmateCpf || data.prisonerCpf;
  const familiar = data.userName;
  const userCpf = data.userCpf;

  if (interno || familiar) {
    if (interno) cupom += `DESTINATARIO: ${limparLinha(interno, 34)}\n`;
    if (inmateCpf) cupom += `CPF INTERNO:  ${limparLinha(mascararCpf(inmateCpf), 34)}\n`;
    if (familiar && familiar !== interno) {
      cupom += `FAMILIAR:     ${limparLinha(familiar, 34)}\n`;
      if (userCpf) cupom += `CPF FAMILIAR: ${limparLinha(mascararCpf(userCpf), 34)}\n`;
    }
    cupom += `${divisor}\n`;
  }

  const loc = data.inmateLocation || data.deliveryLocation;
  if (loc) {
    const parts = [
      loc.raio || loc.ray ? `RAIO ${loc.raio || loc.ray}` : null,
      loc.ala || loc.wing ? `ALA ${loc.ala || loc.wing}` : null,
      loc.cela || loc.cell ? `CELA ${loc.cela || loc.cell}` : null
    ].filter(Boolean);
    if (parts.length) {
      cupom += `LOCALIZACAO: ${parts.join(' | ')}\n`;
      cupom += `${divisor}\n`;
    }
  }

  cupom += `${"ITEM".padEnd(26)}${"QTD X UN".padStart(9)}${"TOTAL".padStart(13)}\n`;
  cupom += `${divisor}\n`;
  for (const item of itens) {
    const nome = String(item?.name || item?.nome || 'ITEM').toUpperCase();
    const qtd = Number(item.quantity) || 1;
    const precoUnit = Number(item.priceAtPurchase || item.price || 0);
    const valor = (precoUnit * qtd).toFixed(2).replace('.', ',');
    const pontoQtd = String(`${qtd} X ${precoUnit.toFixed(2).replace('.', ',')}`).padStart(12);
    const pontoTotal = String("R$ " + valor).padStart(14);
    // Espaço para o nome = largura total menos as colunas de qtd/total.
    // Preços longos (ex.: 1.000,00) antes empurravam a linha além da 48ª coluna.
    const espacoNome = Math.max(1, 48 - (pontoQtd.length + pontoTotal.length));
    const nomeLinha = nome.length > espacoNome
      ? (espacoNome > 3 ? nome.substring(0, espacoNome - 3) + '...' : nome.substring(0, espacoNome))
      : nome.padEnd(espacoNome);
    cupom += `${nomeLinha}${pontoQtd}${pontoTotal}\n`;
  }
  cupom += `${divisor}\n`;
  if (itens.length > 0) {
    const totalQtd = itens.reduce((s, i) => s + (Number(i?.quantity) || 1), 0);
    cupom += formatarLinhaDupla(`${itens.length} ${itens.length === 1 ? 'ITEM' : 'ITENS'} (${totalQtd} UN)`, '', 48) + "\n";
  }

  const total = Math.abs(data.total || 0);
  const subtotal = itens.reduce((s, i) => s + (Number(i?.priceAtPurchase || i?.price || 0) * (Number(i?.quantity) || 1)), 0);
  const desconto = subtotal - total;
  if (Math.abs(desconto) > 0.005) {
    cupom += formatarLinhaDupla("SUBTOTAL:", `R$ ${subtotal.toFixed(2).replace('.', ',')}`, 48) + "\n";
    if (desconto > 0) {
      cupom += formatarLinhaDupla("DESCONTO:", `-R$ ${desconto.toFixed(2).replace('.', ',')}`, 48) + "\n";
    } else {
      cupom += formatarLinhaDupla("ACRESCIMO:", `R$ ${Math.abs(desconto).toFixed(2).replace('.', ',')}`, 48) + "\n";
    }
    cupom += `${divisor}\n`;
  }
  cupom += `${divisorDuplo}\n`;
  cupom += formatarLinhaDupla("TOTAL PEDIDO:", `R$ ${total.toFixed(2).replace('.', ',')}`, 48) + "\n";
  cupom += `${divisorDuplo}\n`;

  // ── VENDA EM DUPLA (débito compartilhado de carteira) ──
  const jw = data.jointWallet;
  if (jw && Number(jw.secondWalletAmount) > 0) {
    const parte1 = Number(jw.firstWalletAmount !== undefined ? jw.firstWalletAmount : Math.max(0, total - Number(jw.secondWalletAmount)));
    cupom += `CARTEIRA (EM DUPLA)\n`;
    cupom += formatarLinhaPontilhada("DEVEDOR 1", `R$ ${Math.max(0, parte1).toFixed(2).replace('.', ',')}`, 48) + "\n";
    const nome2 = limparLinha(jw.secondUserName || 'DEVEDOR 2', 24);
    cupom += formatarLinhaPontilhada(`DEVEDOR 2: ${nome2}`, `R$ ${Number(jw.secondWalletAmount).toFixed(2).replace('.', ',')}`, 48) + "\n";
    if (jw.secondUserCpf && jw.secondUserCpf !== '000.000.000-00') {
      cupom += `CPF DEV.2: ${limparLinha(mascararCpf(jw.secondUserCpf), 36)}\n`;
    }
    cupom += `${divisor}\n`;
  }

  const payments = Array.isArray(data.payments) ? data.payments : [];
  if (payments.length > 0) {
    cupom += `${divisor}\n`;
    cupom += `FORMAS DE PAGAMENTO\n`;
    const nomesMetodo: any = { PIX: 'PIX', WALLET: 'CARTEIRA', CASH: 'DINHEIRO', CARD: 'CARTAO', FIADO: 'FIADO' };
    for (const p of payments) {
      const metodo = nomesMetodo[p.method] || String(p.method || '?').toUpperCase();
      cupom += formatarLinhaPontilhada(metodo, `R$ ${Number(p.amount || 0).toFixed(2).replace('.', ',')}`, 48) + "\n";
    }
    if (data.change !== undefined && data.change !== null && Number(data.change) > 0) {
      cupom += formatarLinhaPontilhada("TROCO", `R$ ${Number(data.change).toFixed(2).replace('.', ',')}`, 48) + "\n";
    }
  } else {
    const pagamento = data.paymentMethod === 'WALLET' ? 'CARTEIRA' : data.paymentMethod === 'PIX' ? 'PIX' : data.paymentMethod === 'FIADO' ? 'FIADO' : data.paymentMethod === 'CARD' ? (data.cardBrand ? `CARTAO (${data.cardBrand})` : 'CARTAO') : 'DINHEIRO';
    cupom += formatarLinhaDupla("PAGAMENTO:", pagamento, 48) + "\n";
    if (data.change !== undefined && data.change !== null && Number(data.change) > 0) {
      cupom += formatarLinhaPontilhada("TROCO", `R$ ${Number(data.change).toFixed(2).replace('.', ',')}`, 48) + "\n";
    }
  }

  const saldoAnterior = data.walletBalanceBefore;
  const saldo = data.walletBalanceAfter;
  if (saldoAnterior !== undefined && saldoAnterior !== null) {
    cupom += formatarLinhaDupla("SALDO ANTERIOR:", `R$ ${Math.abs(saldoAnterior).toFixed(2).replace('.', ',')}`, 48) + "\n";
  }
  if (saldo !== undefined && saldo !== null) {
    cupom += formatarLinhaDupla("SALDO ATUAL:", `R$ ${Math.abs(saldo).toFixed(2).replace('.', ',')}`, 48) + "\n";
  }

  const pixKey = Array.isArray(config?.pixKeys) && config.pixKeys[0] ? String(config.pixKeys[0]) : '';
  const temPix =
    String(data.paymentMethod || '').toUpperCase() === 'PIX' ||
    (Array.isArray(data.payments) && data.payments.some((p: any) => String(p.method || '').toUpperCase() === 'PIX'));
  if (pixKey && temPix) {
    cupom += `${divisor}\n`;
    cupom += `CHAVE PIX (CONFERENCIA)\n`;
    cupom += `${pixKey.slice(0, 48)}\n`;
  }

  cupom += `${divisorDuplo}\n`;
  cupom += `${centrarTexto(String(config?.receiptFooter || 'AUTENTICO PARA CONFERENCIA').toUpperCase().slice(0, 48), 48)}\n`;
  const idClean = String(data.id || 'XXXX').replace(/-/g, '').toUpperCase();
  const seedA = idClean.slice(0, 8).padEnd(8, '0');
  const seedB = (seedA.split('').reverse().join('') + seedA).slice(0, 8).padEnd(8, '0');
  const authHash = `SEC-${seedA}-${seedB}`;
  cupom += `${centrarTexto(`AUTH: ${authHash}`, 48)}\n`;
  if (cnpj) cupom += `${centrarTexto(`CNPJ: ${cnpj}`, 48)}\n`;
  cupom += `${divisorDuplo}\n`;
  cupom += `${centrarTexto('FIM DO CUPOM - BOBINA 80MM', 48)}\n`;
  cupom += `\n`.repeat(6);
  return cupom;
}

/**
 * Envia texto cru para a bobina térmica (compatibilidade Tectoy).
 * 1) Tenta impressão direta via QZ Tray (driver ESC/POS instalado).
 * 2) Sem QZ Tray, cai no window.print() (browser → driver térmico configurado).
 * Retorna true se usou QZ Tray, false se usou o fallback do navegador.
 */
export async function imprimirCupomTectoy(conteudo: string, config?: any): Promise<boolean> {
  const ok = await imprimirBobinaFiscal(conteudo, config);
  if (ok) return true;
  imprimirCupom(conteudo);
  return false;
}

/**
 * Aguarda o SDK do QZ Tray carregar por até `timeout` ms.
 * Se o SDK não existe ou já falhou recentemente, retorna falso IMEDIATAMENTE
 * (sem espera de 4s) — corrige a demora de impressão quando o QZ não está presente.
 */
let conexaoQzCache: Promise<boolean> | null = null;
let qzIndisponivelAte = 0;
let pagehideInstalado = false;

// Cache NEGATIVO de sessão: se o QZ Tray falhou uma vez no navegador, as
// próximas impressões da MESMA sessão pulam a espera de handshake/cabos flag
// e caem direto no fallback — a 1ª demora não se repete em cada cupom.
const QZ_SESSION_BLOCK = 'mf-qz-blocked-session';

function qzBloqueadoSessao(): boolean {
  try { return sessionStorage.getItem(QZ_SESSION_BLOCK) === '1'; } catch { return false; }
}

function bloquearQzSessao() {
  try { sessionStorage.setItem(QZ_SESSION_BLOCK, '1'); } catch { /* noop */ }
}

async function waitForQz(timeout = 900): Promise<boolean> {
  const w = window as any;
  if (qzBloqueadoSessao()) return false;
  if (!w.qz || !w.qz.websocket) return false;
  if (Date.now() < qzIndisponivelAte) return false;
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (w.qz?.websocket && typeof w.qz.websocket.connect === 'function') return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return !!(w.qz?.websocket && typeof w.qz.websocket.connect === 'function');
}

/**
 * Conexão QZ REUTILIZADA entre impressões (socket quente).
 * A primeira impressão faz o handshake; as seguintes usam isActive() e
 * imprimem em milissegundos em vez de re-conectar/desconectar a cada cupom.
 */
function conectarQz(): Promise<boolean> {
  const qz = (window as any).qz;
  if (!qz?.websocket) return Promise.resolve(false);
  if (qzBloqueadoSessao()) return Promise.resolve(false);
  if (qz.websocket.isActive && qz.websocket.isActive()) return Promise.resolve(true);
  if (conexaoQzCache) return conexaoQzCache;

  conexaoQzCache = Promise.race([
    qz.websocket
      .connect()
      .then(() => true)
      .catch(() => {
        qzIndisponivelAte = Date.now() + 10000;
        bloquearQzSessao();
        conexaoQzCache = null;
        return false;
      }),
    new Promise<boolean>((r) => {
      setTimeout(() => {
        if (conexaoQzCache) conexaoQzCache = null;
        r(false);
      }, 2000);
    }),
  ]);

  if (!pagehideInstalado) {
    pagehideInstalado = true;
    window.addEventListener('pagehide', () => {
      try {
        const q = (window as any).qz;
        if (q?.websocket?.disconnect) q.websocket.disconnect().catch(() => undefined);
      } catch { /* noop */ }
      conexaoQzCache = null;
    });
  }
  return conexaoQzCache;
}

/**
 * Envia texto cru apenas para a impressora fiscal via QZ Tray (sem fallback do navegador).
 * Envia a sequência ESC/POS binária (INIT + texto + corte automático + gaveta opcional)
 * quando habilitado (config.escposEnabled !== false).
 * Retorna true se imprimiu pela bobina, false se o QZ não estava disponível.
 * Usado pela janela /print: quando retorna false, o chamador usa o fallback visual.
 */
export async function imprimirBobinaFiscal(conteudo: string, config?: any): Promise<boolean> {
  const w = window as any;
  const disponivel = await waitForQz();
  const qz = w.qz;
  if (!disponivel || !qz || !qz.websocket) return false;

  const conectado = await conectarQz();
  if (!conectado || !(qz.websocket.isActive && qz.websocket.isActive())) return false;

  try {
    const configImp: any = {
      copies: Math.max(1, Number(config?.receiptCopies || 1)),
      dotDensity: Number(config?.qzDotDensity || 6),
    };
    // Cupons longos (muitos itens) podem estourar o buffer da impressora —
    // o QZ envia em chunks de 1 linha quando spool está habilitado.
    if (conteudo.length > 2500) {
      configImp.spool = { end: '\n', size: 1 };
    }
    const usaEscPos = config?.escposEnabled !== false;
    const data = usaEscPos
      ? [{ type: 'raw', format: 'base64', data: montarEscPos(conteudo, config) }]
      : [{ type: 'raw', format: 'plain', data: conteudo }];
    await qz.print(configImp, data);
    return true;
  } catch (e) {
    // Falha → descarta a conexão cacheada para a próxima tentativa reconstruir.
    conexaoQzCache = null;
    if (qz.websocket.isActive && qz.websocket.isActive()) {
      qz.websocket.disconnect().catch(() => undefined);
    }
    console.warn('[imprimirBobinaFiscal] Falha na impressão QZ:', e);
  }
  return false;
}

/**
 * Replacer do JSON.stringify que CONVERTE Firestore Timestamp (objeto com
 * toDate() ou {seconds,nanoseconds}) em string ISO — antes o JSON.stringify
 * descartava a função toDate() e o dado saía como "{}" (pedido virara recibo
 * sem data). Objetos circulares continuam lançando; o catch do chamador trata.
 */
const SERIALIZER_REPLACER = (_key: string, value: any): any => {
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null;
    }
    if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value.toISOString();
    }
  }
  return value;
};

// Fallback de base64 para ambientes sem `btoa` (vitest/Node). Usado no payload
// ?d= da janela de impressão — se nada estiver disponível, o localStorage
// continua funcionando como segunda fonte.
function basicBase64(str: string): string {
  const buf = (globalThis as any).Buffer;
  if (buf && typeof buf.from === 'function') return buf.from(str, 'utf-8').toString('base64');
  return '';
}

/**
 * Salva o item de impressão em localStorage e abre a janela de impressão profissional (/print).
 * Retorna a janela criada ou null se o popup foi bloqueado.
 */
export function abrirJanelaImpressao(
  item: { type: string; data: any; subType?: string },
  config?: any
): Window | null {
  try {
    // Payload completo EMBARCADO na URL (?d=base64). No Electron, o main lê este
    // parâmetro e entrega para a janela /print dedicada — sem depender do
    // localStorage compartilhado entre "arquivos" file:// (não confiável entre
    // janelas). No navegador/web o ?d cobre telas frescas; o localStorage
    // continua servindo de second source (evento 'storage' entre janelas).
    const dadosBrutos = JSON.stringify({ item, config: config || {} }, SERIALIZER_REPLACER);
    const dadosCod = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(dadosBrutos)))
      : encodeURIComponent(basicBase64(dadosBrutos));
    localStorage.setItem('printItem', JSON.stringify(item, SERIALIZER_REPLACER));
    localStorage.setItem('appSettings', JSON.stringify(config || {}, SERIALIZER_REPLACER));
    // Ticket único: garante que a janela /print existente detecte a NOVA
    // impressão (evento 'storage' só dispara quando o valor muda) e se
    // atualize sozinha — sem precisar recarregar/atualizar a janela.
    localStorage.setItem('printTicket', String(Date.now() + Math.random()));
    const win = window.open(
      `/print.html?d=${encodeURIComponent(dadosCod)}`,
      'janelaImpressao',
      'width=880,height=960,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
    );
    if (win && !win.closed) {
      try { win.focus(); } catch { /* noop */ }
    }
    return win;
  } catch (e) {
    console.warn('Falha ao abrir janela de impressão (popup bloqueado ou dados inválidos):', e);
    return null;
  }
}

/**
 * Imprime TEXTO cru (cupom térmico) DIRETO na impressora padrão, SEM diálogo e
 * SEM abrir janela — usa a impressão silenciosa do Electron (webContents.print
 * com silent:true em janela oculta). Retorna true se imprimiu.
 * Fora do Electron retorna false (o chamador usa o fallback visual).
 */
export async function imprimirHtmlSilencioso(conteudo: string, config?: any): Promise<boolean> {
  try {
    const api = (window as any).electronAPI;
    if (!api?.printHtmlSilent) return false;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: 76mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { width: 76mm; margin: 0 auto; box-sizing: border-box; padding: 2mm 1mm; }
      pre { font-family: 'Courier New', Courier, monospace; font-size: ${Number(config?.receiptFontSizeRaw) || 9}px; line-height: 1.2; color: #000; white-space: pre; }
    </style></head><body><pre>${conteudo
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</pre></body></html>`;
    const res = await api.printHtmlSilent(html, config?.printerName);
    return res?.ok === true;
  } catch (e) {
    console.warn('Falha na impressão silenciosa (Electron):', e);
    return false;
  }
}

/**
 * Impressão SILENCIOSA apenas na fiscal (QZ Tray + Electron silent).
 * NUNCA abre janela, diálogo ou popup — usado na auto-impressão pós-venda:
 * se não houver impressora fiscal disponível, o cupom fica apenas na tela
 * (o operador decide imprimir pelo botão do modal de sucesso).
 * Retorna true se imprimiu por alguma via silenciosa.
 */
export async function imprimirSilenciosoFiscal(
  item: { type: string; data: any; subType?: string },
  config?: any
): Promise<boolean> {
  const raw = gerarCupomEntregaRaw(item.data, config);
  try {
    const ok = await imprimirBobinaFiscal(raw, config);
    if (ok) return true;
  } catch (e) {
    console.warn('Falha na impressão fiscal direta (silenciosa):', e);
  }
  return imprimirHtmlSilencioso(raw, config);
}

/**
 * Impressão com PRIORIDADE FISCAL:
 * 1) Tenta a bobina fiscal diretamente via QZ Tray (sem popup e sem diálogo).
 * 2) No app desktop (Electron): imprime SILENCIOSO direto na impressora padrão,
 *    sem abrir janela nem diálogo (nada de múltiplas janelas para confirmar).
 * 3) Navegador sem QZ: abre a janela de impressão profissional /print (fallback).
 * 4) Popup bloqueado → imprime na própria janela usando o layout térmico global.
 * Retorna true se imprimiu direto na fiscal.
 */
export async function imprimirComPrioridadeFiscal(
  item: { type: string; data: any; subType?: string },
  config?: any
): Promise<boolean> {
  const raw = gerarCupomEntregaRaw(item.data, config);
  try {
    const ok = await imprimirBobinaFiscal(raw, config);
    if (ok) return true;
  } catch (e) {
    console.warn('Falha na impressão fiscal direta:', e);
  }
  // App desktop: impressão silenciosa sem janelas e sem diálogos
  const electronOk = await imprimirHtmlSilencioso(raw, config);
  if (electronOk) return true;
  const win = abrirJanelaImpressao(item, config);
  if (!win) {
    imprimirCupom(raw);
  }
  return false;
}

/**
 * Gera e baixa o texto cru como arquivo .txt — útil quando a bobina
 * é gerenciada por software externo (ex.: utilitário Tectoy) ou o QZ não está ativo.
 */
export function baixarCupomTxt(conteudo: string, prefixo = 'cupom'): void {
  const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefixo}-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Boletim diário de prestação de contas (fim do turno):
 * vendas por forma de pagamento, caixa físico conferido, crédito e fiado do dia.
 * Imprimível em bobina térmica e assinável pelo responsável.
 */
export function gerarBoletimDiario(dados: any, config?: any): string {
  const divisor = "-".repeat(40);
  const divisorDuplo = "=".repeat(40);

  const inst = String(config?.institutionName || 'MERCADO FACIL PDV').slice(0, 40).toUpperCase();
  const appName = String(config?.appName || '').slice(0, 40).toUpperCase();

  let cupom = "";
  cupom += `========================================\n`;
  cupom += `${centrarTexto(inst, 40)}\n`;
  if (appName) cupom += `${centrarTexto(appName, 40)}\n`;
  cupom += `${centrarTexto('BOLETIM DIARIO', 40)}\n`;
  cupom += `${centrarTexto(dados?.data || new Date().toLocaleDateString('pt-BR'), 40)}\n`;
  cupom += `${divisorDuplo}\n\n`;

  cupom += `${centrarTexto('VENDAS DO DIA', 40)}\n`;
  const formas = Array.isArray(dados?.formas) ? dados.formas : [];
  if (formas.length > 0) {
    cupom += `${divisor}\n`;
    formas.forEach((f: any) => {
      cupom += formatarLinhaDupla(
        `${f.metodo} (${Number(f.quantidade) || 0})`,
        `R$ ${(Number(f.total) || 0).toFixed(2)}`
      ) + "\n";
    });
    cupom += `${divisor}\n`;
  }
  cupom += formatarLinhaDupla("TOTAL DO DIA", `R$ ${(Number(dados?.totalDia) || 0).toFixed(2)}`) + "\n\n";

  const caixas = Array.isArray(dados?.caixa) ? dados.caixa : [];
  if (caixas.length > 0) {
    cupom += `${centrarTexto('CAIXA FISICO', 40)}\n`;
    cupom += `${divisor}\n`;
    caixas.forEach((c: any) => {
      if (c.operador) cupom += `Operador: ${String(c.operador).slice(0, 34)}\n`;
      const dif = Number(c.diferenca) || 0;
      cupom += formatarLinhaDupla("Esperado:", `R$ ${(Number(c.esperado) || 0).toFixed(2)}`) + "\n";
      cupom += formatarLinhaDupla("Contado:", `R$ ${(Number(c.contado) || 0).toFixed(2)}`) + "\n";
      if (dif === 0) {
        cupom += `   >>> CAIXA CONFERIDO <<<   \n`;
      } else if (dif < 0) {
        cupom += formatarLinhaDupla("DIFERENCA (FALTA):", `R$ ${Math.abs(dif).toFixed(2)}`) + "\n";
      } else {
        cupom += formatarLinhaDupla("DIFERENCA (SOBRA):", `R$ ${Math.abs(dif).toFixed(2)}`) + "\n";
      }
      cupom += `${divisor}\n`;
    });
    cupom += "\n";
  }

  cupom += `${centrarTexto('OUTROS', 40)}\n`;
  cupom += formatarLinhaDupla("Credito (Carteira):", `R$ ${(Number(dados?.carteiraTotal) || 0).toFixed(2)}`) + "\n";
  cupom += formatarLinhaDupla("Vendas Fiado:", `R$ ${(Number(dados?.fiadoTotal) || 0).toFixed(2)}`) + "\n\n";

  const emitidoPor = String(dados?.emitidoPor || "Administrador").slice(0, 34);
  cupom += `Emitido por: ${emitidoPor}\n`;
  cupom += `${divisor}\n`;
  cupom += `Responsavel: _______________________\n`;
  cupom += `${divisorDuplo}\n`;
  cupom += `${adicionarFeed()}`;
  return cupom;
}
