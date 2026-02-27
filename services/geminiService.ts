import { GoogleGenAI } from "@google/genai";

// Inicializa a API apenas se necessário (para imagens)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

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
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

        // 1. Extrair Fornecedor (Emitente)
        const emit = xmlDoc.getElementsByTagName('emit')[0];
        const dest = xmlDoc.getElementsByTagName('dest')[0]; // Opcional: verificar destinatário
        
        const supplierName = emit?.getElementsByTagName('xNome')[0]?.textContent || 'Fornecedor XML';
        const supplierCNPJ = emit?.getElementsByTagName('CNPJ')[0]?.textContent || '';

        // 2. Extrair Itens (Detalhes)
        const dets = xmlDoc.getElementsByTagName('det');
        const items: InvoiceData['items'] = [];

        for (let i = 0; i < dets.length; i++) {
            const prod = dets[i].getElementsByTagName('prod')[0];
            if (prod) {
                const name = prod.getElementsByTagName('xProd')[0]?.textContent || 'Produto sem nome';
                const qCom = parseFloat(prod.getElementsByTagName('qCom')[0]?.textContent || '0');
                const vUnCom = parseFloat(prod.getElementsByTagName('vUnCom')[0]?.textContent || '0');
                const ean = prod.getElementsByTagName('cEAN')[0]?.textContent || '';
                
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
                    ean: ean
                });
            }
        }

        return {
            supplier: {
                name: supplierName,
                cnpj: supplierCNPJ.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
            },
            items
        };

    } catch (error) {
        console.error("Erro ao ler XML:", error);
        return null;
    }
};

// --- PARSER DE IMAGEM (IA Gemini) ---
export const parseInvoiceImage = async (base64Image: string): Promise<InvoiceData | null> => {
  try {
    let cleanBase64 = base64Image;
    if (base64Image.includes('base64,')) {
        cleanBase64 = base64Image.split('base64,')[1];
    }

    const mimeType = base64Image.includes('image/png') ? 'image/png' : 'image/jpeg';

    if (!process.env.API_KEY) {
        console.error("API Key não encontrada");
        return null;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: {
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
      },
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
