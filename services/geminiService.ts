import { GoogleGenAI } from "@google/genai";

// Inicialização preguiçosa para evitar erro fatal no carregamento do módulo se a chave estiver vazia
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey || apiKey === 'COLOQUE_SUA_CHAVE_AQUI') {
    throw new Error("Chave de API do Gemini não configurada. Verifique o arquivo .env");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI(apiKey);
  }
  return aiInstance;
};

const cleanJsonString = (str: string) => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

export interface InvoiceData {
  supplier?: {
    name: string;
    cnpj: string;
  };
  items: {
    name: string;
    costPrice: number;
    quantity: number;
    category: string;
    description: string;
    ean?: string;
  }[];
}

// --- PARSER NATIVO DE XML (NFe Brasileira) ---
export const parseInvoiceXML = (xmlContent: string): InvoiceData | null => {
  console.log("Iniciando parse de XML...", xmlContent.substring(0, 100) + "...");
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

    // Helper para extrair texto de tag ignorando namespace
    const getTagText = (parent: Element | Document, tagName: string): string => {
      try {
        const el = parent.getElementsByTagNameNS ? parent.getElementsByTagNameNS('*', tagName)[0] : parent.getElementsByTagName(tagName)[0];
        return el?.textContent?.trim() || '';
      } catch (e) {
        console.warn(`Erro ao buscar tag ${tagName}:`, e);
        return '';
      }
    };

    const getTagList = (parent: Element | Document, tagName: string): Element[] => {
      const tags = parent.getElementsByTagNameNS ? parent.getElementsByTagNameNS('*', tagName) : parent.getElementsByTagName(tagName);
      return Array.from(tags as HTMLCollectionOf<Element>);
    };

    // Função para limpar números (converte vírgula em ponto se necessário)
    const parseFormattedFloat = (val: string): number => {
      if (!val) return 0;
      const clean = val.replace(',', '.');
      return parseFloat(clean) || 0;
    };

    // 1. Extrair Fornecedor (Emitente)
    const emits = getTagList(xmlDoc, 'emit');
    if (emits.length === 0) {
      console.warn("Tag <emit> não encontrada no XML.");
    }
    const emit = emits[0];

    const supplierName = getTagText(emit || xmlDoc, 'xNome') || 'Fornecedor XML';
    const supplierCNPJ = getTagText(emit || xmlDoc, 'CNPJ') || '';

    // 2. Extrair Itens (Detalhes)
    const dets = getTagList(xmlDoc, 'det');
    const items: InvoiceData['items'] = [];

    for (const det of dets) {
      const prod = det.getElementsByTagNameNS ? det.getElementsByTagNameNS('*', 'prod')[0] : det.getElementsByTagName('prod')[0];
      if (prod) {
        const name = getTagText(prod, 'xProd') || 'Produto sem nome';
        const qCom = parseFormattedFloat(getTagText(prod, 'qCom'));
        const vUnCom = parseFormattedFloat(getTagText(prod, 'vUnCom'));
        const ean = getTagText(prod, 'cEAN') || '';

        // Tenta categorizar pelo nome (básico)
        let category = 'Geral';
        const lowerName = name.toLowerCase();
        if (lowerName.includes('arroz') || lowerName.includes('feijao') || lowerName.includes('carne') || lowerName.includes('bolo')) category = 'Alimentação';
        if (lowerName.includes('sabone') || lowerName.includes('shampoo') || lowerName.includes('dental')) category = 'Higiene';
        if (lowerName.includes('sanit') || lowerName.includes('deterg')) category = 'Limpeza';

        items.push({
          name: name,
          quantity: qCom,
          costPrice: vUnCom,
          category: category,
          description: `Importado via XML (EAN: ${ean})`,
          ean: ean !== 'SEM GTIN' ? ean : ''
        });
      }
    }

    if (items.length === 0) {
      console.error("Nenhum item encontrado no XML da nota.");
      return null;
    }

    console.log(`XML processado com sucesso: ${items.length} itens de ${supplierName}`);

    return {
      supplier: {
        name: supplierName,
        cnpj: supplierCNPJ.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      },
      items
    };

  } catch (error) {
    console.error("Erro crítico ao ler XML:", error);
    return null;
  }
};

// --- PARSER DE IMAGEM (IA Gemini) ---
export const parseInvoiceImage = async (base64Image: string): Promise<InvoiceData | null> => {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'COLOQUE_SUA_CHAVE_AQUI') {
      console.error("Gemini API Key não configurada no .env");
      return null;
    }

    let cleanBase64 = base64Image;
    if (base64Image.includes('base64,')) {
      cleanBase64 = base64Image.split('base64,')[1];
    }

    const mimeType = base64Image.includes('image/png') ? 'image/png' : 'image/jpeg';
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64
              }
            },
            {
              text: `Analise esta nota fiscal/cupom.
            Retorne JSON estrito:
            {
              "supplier": { "name": "Nome", "cnpj": "00.000.000/0000-00" },
              "items": [
                {
                  "name": "Produto",
                  "costPrice": 0.00,
                  "quantity": 1,
                  "category": "Geral",
                  "description": ""
                }
              ]
            }`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");
    return JSON.parse(cleanJsonString(text)) as InvoiceData;

  } catch (error) {
    console.error("Erro Gemini:", error);
    return null;
  }
};
