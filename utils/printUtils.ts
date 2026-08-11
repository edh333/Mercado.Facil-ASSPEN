export function formatarLinhaDupla(esquerda: string, direita: string, larguraTotal = 40): string {
  const espacosNecessarios = larguraTotal - (esquerda.length + direita.length);
  if (espacosNecessarios <= 0) return `${esquerda} ${direita}`;
  return esquerda + " ".repeat(espacosNecessarios) + direita;
}

const CORTE = `
\x1B\x6D
\x1B\x64\x34
\x1B\x6D\x32
\x1B\x64\x32

========================================
       CORTE AUTOMATICO DE PAPEL
========================================
`;
function adicionarFeed(): string {
  return "\n".repeat(8);
}

export function gerarCupomFechamento(dadosCaixa: any): string {
  const divisor = "-".repeat(40);
  const divisorDuplo = "=".repeat(40);

  let cupom = "";
  cupom += `========================================\n`;
  cupom += `           MERCADO FACIL PDV            \n`;
  cupom += `      RELATORIO GERENCIAL DE CAIXA      \n`;
  cupom += `========================================\n\n`;

  cupom += `Operador: ${dadosCaixa.operadorNome || dadosCaixa.operatorId}\n`;
  cupom += `Abertura: ${dadosCaixa.openedAt?.toDate().toLocaleString("pt-BR")}\n`;
  if (dadosCaixa.closedAt) {
    cupom += `Fechamento: ${dadosCaixa.closedAt.toDate().toLocaleString("pt-BR")}\n`;
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
export function gerarRelatorioCredito(usuarios: { name: string; cpf: string; id: string; walletBalance: number; status: string }[], apenasComSaldo: boolean, titulo?: string): string {
  const divisor = "-".repeat(40);
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
 * Espelha o CupomEntrega visual em formato texto para impressão direta.
 */
export function gerarCupomEntregaRaw(venda: any, config?: any): string {
  const data = venda || {};
  const itens = data.items || data.itens || [];
  const divisor = "-".repeat(48);
  const divisorDuplo = "=".repeat(48);

  const limparLinha = (v: string, max = 48) => String(v).replace(/[\r\n]+/g, ' ').trim().toUpperCase().slice(0, max);

  const inst = limparLinha(config?.institutionName || config?.appName || 'MERCADO FACIL');
  const app = limparLinha(config?.appName || 'MERCADO FACIL');
  const docName = limparLinha(config?.customReceiptDocName || 'CUPOM DE ENTREGA - NAO FISCAL');

  let cupom = "";
  cupom += `${divisorDuplo}\n`;
  cupom += `${inst}\n`;
  cupom += `${app}\n`;
  cupom += `${docName}\n`;
  cupom += `${divisorDuplo}\n`;

  const dataCriacao = data.createdAt || data.date || data.data;
  const dt = dataCriacao ? new Date(dataCriacao).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
  cupom += formatarLinhaDupla("DATA:", dt, 48) + "\n";
  cupom += formatarLinhaDupla("ID:", `#${String(data.id || '---').slice(0, 10).toUpperCase()}`, 48) + "\n";
  cupom += formatarLinhaDupla("OPER:", String(data.operatorName || 'ADMIN').toUpperCase().slice(0, 15), 48) + "\n";
  cupom += `${divisor}\n`;

  const destinatario = data.inmateName || data.userName;
  if (destinatario) {
    cupom += `DESTINATARIO\n`;
    cupom += `${String(destinatario).toUpperCase().slice(0, 48)}\n`;
    cupom += `${divisor}\n`;
  }

  cupom += `${"ITEM".padEnd(26)}${"QTD".padStart(6)}  ${"VALOR".padStart(14)}\n`;
  cupom += `${divisor}\n`;
  for (const item of itens) {
    const nome = String(item?.name || item?.nome || 'ITEM').toUpperCase();
    const nomeCurto = nome.length > 26 ? nome.substring(0, 23) + '...' : nome;
    const qtd = item.quantity || 1;
    const precoUnit = item.priceAtPurchase || item.price || 0;
    const valor = (precoUnit * qtd).toFixed(2).replace('.', ',');
    cupom += `${nomeCurto.padEnd(26)}${String(qtd).padStart(6)}  ${String("R$ " + valor).padStart(14)}\n`;
  }
  cupom += `${divisor}\n`;

  const total = Math.abs(data.total || 0);
  cupom += formatarLinhaDupla("TOTAL PEDIDO:", `R$ ${total.toFixed(2).replace('.', ',')}`, 48) + "\n";

  const pagamento = data.paymentMethod === 'WALLET' ? 'CARTEIRA' : data.paymentMethod === 'PIX' ? 'PIX' : data.paymentMethod === 'FIADO' ? 'FIADO' : 'DINHEIRO';
  cupom += formatarLinhaDupla("PAGAMENTO:", pagamento, 48) + "\n";

  const saldo = data.walletBalanceAfter;
  if (saldo !== undefined && saldo !== total) {
    cupom += formatarLinhaDupla("SALDO ATUAL:", `R$ ${Math.abs(saldo).toFixed(2).replace('.', ',')}`, 48) + "\n";
  }

  cupom += `${divisorDuplo}\n`;
  cupom += `${String(config?.receiptFooter || 'AUTENTICO PARA CONFERENCIA').toUpperCase().slice(0, 48)}\n`;
  const authHash = `SEC-${String(data.id || 'XXXX').slice(0, 8).toUpperCase()}-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`;
  cupom += `AUTH: ${authHash}\n`;
  cupom += `${divisorDuplo}\n`;
  cupom += `       FIM DO CUPOM - BOBINA 48mm\n`;
  cupom += `\n`.repeat(6);
  return cupom;
}

/**
 * Envia texto cru para a bobina térmica.
 * 1) Tenta impressão direta via QZ Tray (driver Tectoy/ESC/POS instalado).
 * 2) Sem QZ Tray, cai no window.print() (browser → driver térmico configurado).
 * Retorna true se usou QZ Tray, false se usou o fallback do navegador.
 */
export async function imprimirCupomTectoy(conteudo: string): Promise<boolean> {
  const qz = (window as any).qz;
  if (qz && qz.websocket) {
    try {
      await qz.websocket.connect().catch(() => undefined);
      if (qz.websocket.isActive && qz.websocket.isActive()) {
        const config = { copies: 1, dotDensity: 6 } as any;
        const data = [{ type: 'raw', format: 'plain', data: conteudo }];
        await qz.print(config, data);
        await qz.websocket.disconnect().catch(() => undefined);
        return true;
      }
    } catch (e) {
      try { await qz.websocket.disconnect().catch(() => undefined); } catch (_) { /* noop */ }
    }
  }
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
 * Retorna true se imprimiu pela bobina, false se o QZ não estava disponível.
 * Usado pela janela /print: quando retorna false, o chamador usa o fallback visual.
 */
export async function imprimirBobinaFiscal(conteudo: string): Promise<boolean> {
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
    const config = { copies: 1, dotDensity: 6 } as any;
    const data = [{ type: 'raw', format: 'plain', data: conteudo }];
    await qz.print(config, data);
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
 * Impressão com PRIORIDADE FISCAL:
 * 1) Tenta a bobina fiscal diretamente via QZ Tray (sem popup e sem diálogo).
 * 2) Sem QZ, abre a janela de impressão profissional /print (fallback visual 80mm).
 * 3) Popup bloqueado → imprime na própria janela usando o layout térmico global.
 * Retorna true se imprimiu direto na fiscal.
 */
export async function imprimirComPrioridadeFiscal(
  item: { type: string; data: any; subType?: string },
  config?: any
): Promise<boolean> {
  try {
    const ok = await imprimirBobinaFiscal(gerarCupomEntregaRaw(item.data, config));
    if (ok) return true;
  } catch (e) {
    console.warn('Falha na impressão fiscal direta:', e);
  }
  const win = abrirJanelaImpressao(item, config);
  if (!win) {
    imprimirCupom(gerarCupomEntregaRaw(item.data, config));
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
