export function formatarLinhaDupla(esquerda: string, direita: string, larguraTotal = 40): string {
  const espacosNecessarios = larguraTotal - (esquerda.length + direita.length);
  if (espacosNecessarios <= 0) return `${esquerda} ${direita}`;
  return esquerda + " ".repeat(espacosNecessarios) + direita;
}

/** Linha com pontilhado entre rótulo e valor (padrão de cupom fiscal). */
export function formatarLinhaPontilhada(esquerda: string, direita: string, larguraTotal = 40): string {
  const base = `${esquerda} ${direita}`;
  if (base.length >= larguraTotal) return base;
  return esquerda + " " + ".".repeat(larguraTotal - esquerda.length - direita.length - 1) + " " + direita;
}

const ESC = "\x1B";
const GS = "\x1D";

/**
 * Gera a sequência binária ESC/POS do cupom:
 * INIT + texto + avanço de papel + corte automático + abertura de gaveta (opcional).
 * Retorna a string em base64 pronta para o QZ Tray (formato 'raw'/'base64').
 */
export function montarEscPos(texto: string, config?: any): string {
  const cortar = config?.autoCutPaper !== false;
  const gaveta = config?.drawerKick === true;
  const feeds = Math.max(2, Math.min(10, Number(config?.endFeedLines || 4)));

  const encoder = new TextEncoder();
  const bytes: number[] = [];
  const push = (s: string) => bytes.push(...Array.from(encoder.encode(s)));
  push(ESC + "@");                                          // INIT (reset da impressora)
  push(texto);                                              // conteúdo do cupom
  push(ESC + "d" + String.fromCharCode(feeds));             // avança papel N linhas
  if (cortar) push(GS + "V" + "A" + "\x00");                // corte total (GS V 65 0)
  if (gaveta) push(ESC + "p" + "\x00" + "\x19" + "\x32");   // abre gaveta (pin 2, 25ms/50ms)
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
  cupom += `${inst}\n`;
  if (appName) cupom += `${appName}\n`;
  if (cnpj) cupom += `CNPJ: ${cnpj}\n`;
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

  cupom += `      RELATORIO GERENCIAL DE CAIXA      \n\n`;
  cupom += `Operador: ${dadosCaixa.operadorNome || dadosCaixa.operatorId}\n`;
  cupom += `Abertura: ${dataCx(dadosCaixa.openedAt)}\n`;
  if (dadosCaixa.closedAt) {
    cupom += `Fechamento: ${dataCx(dadosCaixa.closedAt)}\n`;
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
  setTimeout(() => { window.print(); }, 350);
}

/**
 * Formata uma lista de produtos para impressão de reposição de estoque.
 */
export function gerarListaReposicao(produtos: { nome: string; estoque: number; minimo: number; qtdComprar: number }[]): string {
  const divisor = "-".repeat(40);

  let texto = "";
  texto += `========================================\n`;
  texto += `       LISTA DE REPOSICAO DE ESTOQUE     \n`;
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
  texto += `       FIM DA LISTA DE REPOSICAO        \n`;
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
  texto += `       RELATORIO DE CREDITOS           \n`;
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
    const cpf = (u.cpf || '—').replace(/\D/g, '').slice(0, 11);
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
  texto += `      FIM DO RELATORIO DE CREDITOS     \n`;
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
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-family:monospace;">${String(x.cpf || '—').replace(/</g, '&lt;')}</td>
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
 */
export function gerarRelatorioInadimplentes(contas: any[]): string {
  const divisor = "-".repeat(40);
  const devedores = contas.filter(c => (c.currentDebt || 0) > 0).sort((a,b) => b.currentDebt - a.currentDebt);

  let texto = "";
  texto += `========================================\n`;
  texto += `       RELATORIO DE INADIMPLENCIA       \n`;
  texto += `========================================\n`;
  texto += `Data: ${new Date().toLocaleDateString("pt-BR")}\n`;
  texto += `Clientes com debito: ${devedores.length}\n`;
  texto += `${divisor}\n\n`;

  texto += `${"CLIENTE".padEnd(25)}${"DIVIDA".padStart(15)}\n`;
  texto += `${divisor}\n`;

  let totalGeral = 0;
  for (const c of devedores) {
    const nome = c.nome.length > 25 ? c.nome.substring(0, 22) + '...' : c.nome;
    const valor = (c.currentDebt || 0).toFixed(2).replace('.', ',');
    texto += `${nome.padEnd(25)}${String("R$ " + valor).padStart(15)}\n`;
    totalGeral += (c.currentDebt || 0);
  }

  texto += `\n${divisor}\n`;
  texto += formatarLinhaDupla("TOTAL A RECEBER:", `R$ ${totalGeral.toFixed(2).replace('.', ',')}`) + "\n";
  texto += `========================================\n`;
  texto += `      FIM DO RELATORIO FINANCEIRO       \n`;
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
  const docName = limparLinha(config?.customReceiptDocName || 'CUPOM DE ENTREGA - NAO FISCAL');
  const cnpj = limparLinha(config?.cnpj || '', 18);
  const telefone = limparLinha(config?.contactPhone || '', 18);

  const status = String(data.status || '').toLowerCase();
  const cancelado = ['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'rejected', 'rejeitado'].includes(status);

  let cupom = "";
  cupom += `${divisorDuplo}\n`;
  cupom += `${inst}\n`;
  cupom += `${app}\n`;
  if (cnpj) cupom += `CNPJ: ${cnpj}\n`;
  if (telefone) cupom += `TEL: ${telefone}\n`;
  cupom += `${docName}\n`;
  cupom += `${divisorDuplo}\n`;

  if (cancelado) {
    cupom += `*** CUPOM CANCELADO / DEVOLVIDO ***\n`;
    cupom += `${divisor}\n`;
  }

  const dataCriacao = data.createdAt || data.date || data.data;
  const dt = dataCriacao ? new Date(dataCriacao).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
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
    if (inmateCpf) cupom += `CPF INTERNO:  ${limparLinha(inmateCpf, 34)}\n`;
    if (familiar && familiar !== interno) {
      cupom += `FAMILIAR:     ${limparLinha(familiar, 34)}\n`;
      if (userCpf) cupom += `CPF FAMILIAR: ${limparLinha(userCpf, 34)}\n`;
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
    const nomeLinha = nome.length > 22 ? nome.substring(0, 19) + '...' : nome;
    cupom += `${nomeLinha.padEnd(22)}${String(`${qtd} X ${precoUnit.toFixed(2).replace('.', ',')}`).padStart(12)}${String("R$ " + valor).padStart(14)}\n`;
  }
  cupom += `${divisor}\n`;

  const total = Math.abs(data.total || 0);
  cupom += formatarLinhaDupla("TOTAL PEDIDO:", `R$ ${total.toFixed(2).replace('.', ',')}`, 48) + "\n";

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
    const pagamento = data.paymentMethod === 'WALLET' ? 'CARTEIRA' : data.paymentMethod === 'PIX' ? 'PIX' : data.paymentMethod === 'FIADO' ? 'FIADO' : 'DINHEIRO';
    cupom += formatarLinhaDupla("PAGAMENTO:", pagamento, 48) + "\n";
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
  cupom += `${String(config?.receiptFooter || 'AUTENTICO PARA CONFERENCIA').toUpperCase().slice(0, 48)}\n`;
  const authHash = `SEC-${String(data.id || 'XXXX').slice(0, 8).toUpperCase()}-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`;
  cupom += `AUTH: ${authHash}\n`;
  if (cnpj) cupom += `CNPJ: ${cnpj}\n`;
  cupom += `${divisorDuplo}\n`;
  cupom += `       FIM DO CUPOM - BOBINA 48mm\n`;
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
 * Aguarda o SDK do QZ Tray carregar (script deferido) por até `timeout` ms.
 */
async function waitForQz(timeout = 4000): Promise<boolean> {
  const w = window as any;
  if (w.qz && w.qz.websocket) return true;
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    await new Promise((r) => setTimeout(r, 120));
    if (w.qz && w.qz.websocket) return true;
  }
  return false;
}

/**
 * Envia texto cru apenas para a impressora fiscal via QZ Tray (sem fallback do navegador).
 * Envia a sequência ESC/POS binária (INIT + texto + corte automático + gaveta opcional)
 * quando habilitado (config.escposEnabled !== false).
 * Retorna true se imprimiu pela bobina, false se o QZ não estava disponível.
 * Usado pela janela /print: quando retorna false, o chamador usa o fallback visual.
 */
export async function imprimirBobinaFiscal(conteudo: string, config?: any): Promise<boolean> {
  const disponivel = await waitForQz();
  const w = window as any;
  const qz = w.qz;
  if (!disponivel || !qz || !qz.websocket) return false;
  try {
    const conectado = await Promise.race([
      qz.websocket.connect().catch(() => undefined),
      new Promise((r) => setTimeout(() => r(undefined), 5000)),
    ]);
    if (!(qz.websocket.isActive && qz.websocket.isActive())) return false;
    const configImp = {
      copies: Math.max(1, Number(config?.receiptCopies || 1)),
      dotDensity: Number(config?.qzDotDensity || 6),
    } as any;
    const usaEscPos = config?.escposEnabled !== false;
    const data = usaEscPos
      ? [{ type: 'raw', format: 'base64', data: montarEscPos(conteudo, config) }]
      : [{ type: 'raw', format: 'plain', data: conteudo }];
    await qz.print(configImp, data);
    await qz.websocket.disconnect().catch(() => undefined);
    return true;
  } catch (e) {
    try { await qz.websocket.disconnect().catch(() => undefined); } catch (_) { /* noop */ }
  }
  return false;
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
    localStorage.setItem('printItem', JSON.stringify(item));
    localStorage.setItem('appSettings', JSON.stringify(config || {}));
    return window.open(
      '/print?print=true',
      'janelaImpressao',
      'width=480,height=800,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
    );
  } catch (e) {
    console.warn('Falha ao abrir janela de impressão:', e);
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
