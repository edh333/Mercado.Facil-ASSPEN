// ───────────────────────────────────────────────────────────────────────────
// PARSER DE NOTA FISCAL ELETRÔNICA (NFe XML)
// ───────────────────────────────────────────────────────────────────────────
// Tolerante a namespaces (notas emitidas com prefixos nfe:/NFe: etc. usam
// getElementsByTagName, que casa pelo nome local ignorando prefixos), com
// fallbacks de quantidade/preço (vUnCom → vProd/qCom → vUnTrib) e validação
// de GTIN/EAN — o código de barras sai pronto para o leitor do PDV.
// ───────────────────────────────────────────────────────────────────────────

// Interface para dados da nota fiscal
export interface InvoiceData {
  supplier?: { name: string; cnpj: string; };
  items: {
    name: string;
    costPrice: number;
    quantity: number;
    category: string;
    description: string;
    ean?: string;
    barcode?: string;
    brand?: string;
  }[];
}

const tagPorNome = (el: Document | Element, nome: string): Element | null => {
  const encontrados = el.getElementsByTagName(nome);
  return encontrados && encontrados.length > 0 ? encontrados[0] : null;
};
const textoDe = (el: Document | Element, nome: string): string =>
  (tagPorNome(el, nome)?.textContent || '').replace(/\u00A0/g, ' ').trim();
const numeroNfe = (el: Document | Element, nome: string): number => {
  // ⚠ CORREÇÃO CRÍTICA: o layout oficial da NFe usa SEMPRE ponto como
  // separador decimal ("<vUnCom>4.99</vUnCom>" = R$ 4,99). O parser antigo
  // removia os pontos como se fossem milhar → preços 100x mais altos
  // (R$ 4,99 virava R$ 499,00) e quantidades explodidas ("2.0000" → 20000).
  // Agora: só ponto → decimal direto (padrão NFe); só vírgula → BR;
  // os dois → o ÚLTIMO separador é o decimal (convenção universal).
  let s = textoDe(el, nome).replace(/\s/g, '');
  if (!s) return NaN;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(/,/g, '.')
      : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
};
const ehGtin = (v: string): boolean => /^\d{8,14}$/.test(v);

export const parseInvoiceXML = (xml: string): InvoiceData | null => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    if (doc.querySelector('parsererror')) {
      console.error('Erro ao analisar XML');
      return null;
    }

    const result: InvoiceData = { items: [] };

    // Extrair fornecedor (emitente) — caminhos NFe e NFeProc (autorização)
    const emit = tagPorNome(doc, 'emit');
    if (emit) {
      const nome = textoDe(emit, 'xNome');
      const cnpj = textoDe(emit, 'CNPJ') || textoDe(emit, 'CPF');
      result.supplier = { name: nome, cnpj };
    }

    // Extrair itens (produtos) — namespace-safe
    const products = doc.getElementsByTagName('det');
    for (let i = 0; i < products.length; i++) {
      const prodElement = tagPorNome(products[i], 'prod');
      if (!prodElement) continue;

      const name = textoDe(prodElement, 'xProd');
      if (!name) continue;

      const ean = textoDe(prodElement, 'cEAN') || textoDe(prodElement, 'cEANTrib') || '';
      const eanValido = ehGtin(ean);
      const code = textoDe(prodElement, 'cProd') || '';
      const ncm = textoDe(prodElement, 'NCM');
      const unidade = textoDe(prodElement, 'uCom') || textoDe(prodElement, 'uTrib') || 'UN';

      // Marca: lista conhecida ou primeira palavra em maiúsculas
      let brand = '';
      const brandList = [
        'ALBA', 'AVIANCA', 'BIC', 'LOREAL', 'NESTLE', 'NESTLÉ', 'DANONE', 'AMBEV', 'HEINEKEN', 'COCA COLA', 'COCA-COLA', 'PEPSI',
        'SKOL', 'BRASEIRO', 'PERNAMBUCANAS', 'HAVAN', 'SAMSUNG', 'LG', 'PHILCO', 'ELECTROLUX', 'BRASTEMP', 'CONSUL', 'XIAOMI',
        'MOTOROLA', 'APPLE', 'POSITIVO', 'MULTILASER', 'ARNO', 'MONDIAL', 'PARATI', 'MARILAN', 'UNILEVER', 'P&G', 'BRF', 'JBS',
        'AURORA', 'MINUANO', 'SADIA', 'PERDIGAO', 'PERDIGÃO', 'SEARA', 'KIMBERLY', 'COLGATE', 'PALMOLIVE', 'NIVEA', 'JOHNSON',
        'OAKLEY', 'NIKE', 'ADIDAS', 'PUMA', 'FILA', 'ASICS', 'MIZUNO', 'KAPPA', 'UMBRO', 'PENALTY', 'TOPPER', 'LUPO', 'TRIFIL',
        'HERING', 'MALWEE', 'MARISA', 'C&A', 'REACHUELO', 'RENNER', 'ZARA', 'LEVIS', 'DIESEL', 'CALVIN KLEIN', 'GUESS',
        'TOMMY HILFIGER', 'LACOSTE', 'HUGO BOSS', 'ARMANI', 'ROLEX', 'PANDORA', 'VIVARA', 'CHILLI BEANS', 'RAY-BAN',
        'NATURA', 'AVON', 'BOTICARIO', 'EUDORA', 'JEQUITI', 'PAMPERS', 'HUGGIES', 'TURMA DA MONICA', 'RENOVE', 'VEJA',
        'OMOR', 'IPÊ', 'LIMPOL', 'YPÊ', 'MINUANO', 'BOMBRIL', 'TIXAN', 'ARIEL', 'BRILHANTE', 'SUFRESH', 'TANG', 'MID',
        'CAMP', 'VALLE', 'KAPO', 'MAGUARY', 'GAROTO', 'LACTA', 'HERSHEY', 'ARCOR', 'M&M', 'FINI', 'DOCILE'
      ];
      const brandRegex = new RegExp(`(?:^|\\s)(${brandList.join('|')})(?:\\s|$)`, 'i');
      const brandMatch = name.match(brandRegex);
      if (brandMatch?.[1]) {
        brand = brandMatch[1].trim().toUpperCase();
      } else {
        const words = name.split(' ');
        if (words[0] && words[0].length > 2 && words[0] === words[0].toUpperCase() && !/^\d+$/.test(words[0]) && !['COM', 'PARA', 'SEM', 'PROD', 'KIT'].includes(words[0])) {
          brand = words[0];
        }
      }

      // Quantidade e preço com fallbacks: vUnCom → vProd/qCom → vUnTrib
      let quantity = numeroNfe(prodElement, 'qCom');
      if (isNaN(quantity) || quantity <= 0) quantity = numeroNfe(prodElement, 'qTrib');
      if (isNaN(quantity) || quantity <= 0) quantity = 1;

      let costPrice = numeroNfe(prodElement, 'vUnCom');
      if (isNaN(costPrice) || costPrice <= 0) {
        const qtdRef = numeroNfe(prodElement, 'qCom') || quantity;
        const vProd = numeroNfe(prodElement, 'vProd');
        if (!isNaN(vProd) && qtdRef > 0) costPrice = vProd / qtdRef;
        else costPrice = numeroNfe(prodElement, 'vUnTrib');
      }
      if (isNaN(costPrice) || costPrice < 0) costPrice = 0;

      // SANITY: preço plausível de supermercado (R$ 0,01 a R$ 100.000 por unidade).
      // NFe corrompida ("vUnCom=78.434.600.000") → tenta vProd/qCom e vUnTrib;
      // se continuar absurdo, zera para o operador ajustar o preço na tela.
      const PRECO_PLAUSIVEL = 100000;
      if (costPrice > PRECO_PLAUSIVEL) {
        const qtdRef = numeroNfe(prodElement, 'qCom') || quantity;
        const vProd = numeroNfe(prodElement, 'vProd');
        const tentativa = (!isNaN(vProd) && qtdRef > 0) ? vProd / qtdRef : numeroNfe(prodElement, 'vUnTrib');
        if (!isNaN(tentativa) && tentativa > 0 && tentativa <= PRECO_PLAUSIVEL) costPrice = tentativa;
        else costPrice = 0;
      }

      // Quantidade absurda (> 999.999) indica qCom corrompida na NFe
      if (quantity > 999999) quantity = 1;

      let category = 'Geral';
      if (ncm) {
        if (ncm.startsWith('02') || ncm.startsWith('03')) category = 'Carnes';
        else if (ncm.startsWith('04') || ncm.startsWith('05')) category = 'Laticínios';
        else if (ncm.startsWith('09')) category = 'Bebidas';
        else if (ncm.startsWith('16') || ncm.startsWith('19')) category = 'Massas';
        else if (ncm.startsWith('17') || ncm.startsWith('20')) category = 'Bebidas';
        else if (ncm.startsWith('21') || ncm.startsWith('22')) category = 'Chocolate';
        else if (ncm.startsWith('23')) category = 'Rações';
        else if (ncm.startsWith('24')) category = 'Bebidas Alcoólicas';
        else if (ncm.startsWith('25') || ncm.startsWith('28')) category = 'Cervejas';
        else if (ncm.startsWith('30') || ncm.startsWith('32')) category = 'Condimentos';
        else if (ncm.startsWith('33')) category = 'Sopas';
        else if (ncm.startsWith('34')) category = 'Sal';
        else if (ncm.startsWith('35')) category = 'Açúcar';
        else if (ncm.startsWith('36')) category = 'Café';
        else if (ncm.startsWith('38')) category = 'Sabão';
        else if (ncm.startsWith('39') || ncm.startsWith('40')) category = 'Sabonetes';
        else if (ncm.startsWith('44')) category = 'Perfumes';
        else if (ncm.startsWith('48')) category = 'Papel';
        else if (ncm.startsWith('49')) category = 'Revistas';
        else if (ncm.startsWith('61')) category = 'Medicamentos';
        else if (ncm.startsWith('62')) category = 'Higiene';
        else if (ncm.startsWith('63')) category = 'Absorventes';
        else if (ncm.startsWith('64') || ncm.startsWith('65')) category = 'Higiene Pessoal';
        else if (ncm.startsWith('70') || ncm.startsWith('73')) category = 'Limpeza';
        else if (ncm.startsWith('84')) category = 'Utensílios';
        else if (ncm.startsWith('85') || ncm.startsWith('87')) category = 'Eletrodomésticos';
        else if (ncm.startsWith('90')) category = 'Suprimentos';
        else if (ncm.startsWith('94')) category = 'Bebidas';
      }

      // Código de barras: GTIN válido da nota, senão o código do fornecedor
      const codigoBarras = eanValido ? ean : (code || undefined);
      result.items.push({
        name,
        costPrice,
        quantity,
        category,
        description: `${code ? 'Código: ' + code + ' | ' : ''}NCM: ${ncm} | Und: ${unidade}`,
        ean: codigoBarras,
        barcode: codigoBarras,
        brand: brand || undefined
      });
    }

    return result.items.length > 0 ? result : null;
  } catch (e) {
    console.error('Erro ao processar XML:', e);
    return null;
  }
};