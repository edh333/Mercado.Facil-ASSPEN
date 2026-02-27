export const formatCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export const formatPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

export const validateCPF = (cpf: string): boolean => {
  const strCPF = cpf.replace(/[^\d]+/g, '');
  if (strCPF.length !== 11 || /^(\d)\1+$/.test(strCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) sum = sum + parseInt(strCPF.substring(i - 1, i)) * (11 - i);
  remainder = (sum * 10) % 11;
  if ((remainder === 10) || (remainder === 11)) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(strCPF.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;
  if ((remainder === 10) || (remainder === 11)) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(10, 11))) return false;

  return true;
};

const toTitleCase = (str: string) => {
  return str.replace(/\w\S*/g, (txt) => {
    if (['PET', 'UVA', 'COCA', 'OVO', 'USA', 'IP', 'LED', 'PVC', 'SAB', 'DET', 'YPE', 'OMO', 'QBOA', 'SP'].includes(txt.toUpperCase())) return txt.toUpperCase();
    if (['KG', 'ML', 'L', 'G', 'M', 'UN', 'CM', 'MM'].includes(txt.toUpperCase())) return txt.toUpperCase(); 
    if (['DE', 'DA', 'DO', 'EM', 'COM', 'E', 'POR', 'PARA', 'SEM'].includes(txt.toUpperCase())) return txt.toLowerCase();
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};

export const cleanProductName = (name: string) => {
  if (!name) return '';
  
  let cleaned = name.toUpperCase();
  cleaned = cleaned.replace(/^[\d\s.-]+/, '');
  cleaned = cleaned.replace(/\(.*?\)/g, ' ');
  cleaned = cleaned.replace(/[*'"_]/g, ' ');

  const abbrevs: Record<string, string> = {
      'BISC': 'BISCOITO', 'BISC.': 'BISCOITO',
      'REFRIG': 'REFRIGERANTE', 'REF': 'REFRIGERANTE', 'REF.': 'REFRIGERANTE',
      'SAB': 'SABONETE', 'SAB.': 'SABONETE',
      'DET': 'DETERGENTE', 'DET.': 'DETERGENTE',
      'AMAC': 'AMACIANTE', 'AMAC.': 'AMACIANTE',
      'CR': 'CREME', 'CR.': 'CREME',
      'PAST': 'PASTA', 'ESC': 'ESCOVA', 'ESC.': 'ESCOVA',
      'PAP': 'PAPEL', 'HIG': 'HIGIENICO', 'HIG.': 'HIGIENICO',
      'CHOC': 'CHOCOLATE', 'CHOC.': 'CHOCOLATE', 'BOMB': 'BOMBOM',
      'BAT': 'BATATA', 'PAL': 'PALHA', 'ACO': 'ACO',
      'INST': 'INSTANTANEO', 'INST.': 'INSTANTANEO',
      'LIMP': 'LIMPEZA', 'MULTI': 'MULTIUSO',
      'DESINF': 'DESINFETANTE', 'DESINF.': 'DESINFETANTE',
      'ABS': 'ABSORVENTE', 'ABS.': 'ABSORVENTE',
      'COND': 'CONDICIONADOR', 'COND.': 'CONDICIONADOR',
      'SHAMP': 'SHAMPOO', 'SHAM': 'SHAMPOO'
  };

  cleaned = cleaned.split(/\s+/).map(word => abbrevs[word] || word).join(' ');
  cleaned = cleaned.replace(/\s+QTD\.?\s+\d+(\.\d+)?\s*[A-Z]{2,}/gi, ''); 
  cleaned = cleaned.replace(/\s+CX\.?\s+\d+([X]\d+)?([A-Z]+)?/gi, '');
  cleaned = cleaned.replace(/\s+CAIXA\s+\d+([X]\d+)?([A-Z]+)?/gi, '');
  cleaned = cleaned.replace(/\s+UNIDADE\s+\d+([X]\d+)?/gi, '');
  cleaned = cleaned.replace(/\s+UN\.?\s+\d+([X]\d+)?/gi, '');
  cleaned = cleaned.replace(/\s+\d+\s*[X]\s*\d+([A-Z]+)?$/gi, ''); 

  const trashWords = [
    'CAIXA', 'CX', 'CX.', 'FARDO', 'FDO', 'FD', 'FD.',
    'PACOTE', 'PCT', 'PCTE', 'PCT.', 'DISPLAY', 'DSP', 
    'DUZIA', 'CARTELA', 'CART', 'UNIDADE', 'UN', 'UNI',
    'PROMOCAO', 'OFERTA', 'GRATIS', 'L.V.', 'PAGUE', 'LEVE'
  ];

  trashWords.forEach(word => {
      const regexEnd = new RegExp(`\\s+${word.replace('.', '\\.')}$`, 'gi');
      cleaned = cleaned.replace(regexEnd, '');
  });

  cleaned = cleaned.replace(/\s+\d+\.\d{2}$/, '');
  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\.\-\s]+|[\.\-\s]+$/g, '').trim();

  return toTitleCase(cleaned);
};

export const normalizeName = (name: string) => {
    return cleanProductName(name).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
};

// --- HELPER BASE64 (Upload Instantâneo) ---
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// --- COMPRESSÃO DE IMAGEM OTIMIZADA E RÁPIDA ---
export const compressImageFile = async (file: File, quality = 0.6, maxWidth = 1000): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        // Cálculo de proporção para redimensionamento
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
             reject(new Error("Erro ao criar contexto de imagem"));
             return;
        }

        // Fundo branco para caso seja PNG transparente convertido para JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            console.log(`Imagem comprimida: ${file.size} -> ${blob.size} bytes`);
            resolve(blob);
          } else {
            reject(new Error("Falha ao comprimir imagem."));
          }
        }, 'image/jpeg', quality);
      };
      
      img.onerror = (error) => reject(error);
    };
    
    reader.onerror = (error) => reject(error);
  });
};

// --- GERAÇÃO PIX ---
const calculateCRC16 = (payload: string): string => {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = (crc << 1);
      crc = crc & 0xFFFF; 
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
};

const formatField = (id: string, value: string): string => {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
};

const sanitize = (str: string, maxLength: number): string => {
  const clean = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 *]/g, "").trim().toUpperCase();
  return clean.substring(0, maxLength);
};

export const generatePixPayload = (key: string, name: string, city: string, amount: number, txid: string = '***'): string => {
  let cleanKey = key.trim();
  if (!cleanKey.includes('@') && cleanKey.length < 32) cleanKey = cleanKey.replace(/[^0-9]/g, '');

  const payloadKey = formatField("00", "br.gov.bcb.pix") + formatField("01", cleanKey);
  const merchantName = sanitize(name, 25); 
  const merchantCity = sanitize(city, 15);
  const amountStr = amount.toFixed(2);

  const payloadNoCrc = `000201` + formatField("26", payloadKey) + formatField("52", "0000") + formatField("53", "986") + 
    (amount > 0 ? formatField("54", amountStr) : "") + formatField("58", "BR") + formatField("59", merchantName) + 
    formatField("60", merchantCity) + formatField("62", formatField("05", sanitize(txid || '***', 25))) + `6304`; 

  return `${payloadNoCrc}${calculateCRC16(payloadNoCrc)}`;
};