export const formatCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

/**
 * Mascara CPF para conformidade LGPD (impressões/relatórios): mantém visíveis
 * apenas os 3 primeiros e os 2 últimos dígitos. Ex.: 529.***.***-25
 * Strings curtas ou vazias passam como "***" — nunca expõe o número completo.
 */
export const mascararCpf = (cpf: string | null | undefined): string => {
  const digitos = String(cpf || '').replace(/\D/g, '');
  if (digitos.length < 6) return '***';
  const inicio = digitos.slice(0, 3);
  const fim = digitos.slice(-2);
  return `${inicio}.***.***-${fim}`;
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
    if (['KG', 'ML', 'L', 'G', 'M', 'UN', 'CM', 'MM'].includes(txt.toUpperCase())) return txt.toLowerCase(); 
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

  const trashWords = [
    'CAIXA', 'CX', 'CX.', 'FARDO', 'FDO', 'FD', 'FD.',
    'PACOTE', 'PCT', 'PCTE', 'PCT.', 'DISPLAY', 'DSP', 
    'DUZIA', 'CARTELA', 'CART', 
    'PROMOCAO', 'OFERTA', 'GRATIS', 'L.V.', 'PAGUE', 'LEVE',
    'SABORES', 'SABOR', 'SAB', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'COM', 'E', 'EM', 'PARA'
  ];

  trashWords.forEach(word => {
      const regexEnd = new RegExp(`\\s+${word.replace('.', '\\.')}$`, 'gi');
      const regexMid = new RegExp(`\\s+${word.replace('.', '\\.')}\\s+`, 'gi');
      cleaned = cleaned.replace(regexEnd, '');
      cleaned = cleaned.replace(regexMid, ' ');
  });

  cleaned = cleaned.replace(/\s+\d+\.\d{2}$/, '');
  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\.\-\s]+|[\.\-\s]+$/g, '').trim();

  return toTitleCase(cleaned);
};

export const normalizeName = (name: string) => {
    return cleanProductName(name).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
};

export const stringSimilarity = (a: string, b: string): number => {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length < b.length ? a : b;
  if (longer.length === 0) return 1.0;
  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) costs[i] = i;
  for (let i = 1; i <= longer.length; i++) {
    let prev = i;
    for (let j = 1; j <= shorter.length; j++) {
      const val = longer[i - 1] === shorter[j - 1] ? costs[j - 1] : Math.min(
        costs[j - 1] + 1,
        prev + 1,
        costs[j] + 1
      );
      costs[j - 1] = prev;
      prev = val;
    }
    costs[shorter.length] = prev;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const compressImageFile = async (file: File, quality = 0.6, maxWidth = 1000): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
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

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
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

export const generatePixPayload = (key: string, name: string, city: string, amount: number, txid: string = 'MERCFACIL'): string => {
  let cleanKey = key.trim();
  if (!cleanKey.includes('@') && cleanKey.length < 32) cleanKey = cleanKey.replace(/[^0-9]/g, '');

  const validAmount = Math.max(0.01, Math.abs(Number(amount) || 0.01));

  const payloadKey = formatField("00", "br.gov.bcb.pix") + formatField("01", cleanKey);
  const merchantName = sanitize(name, 25); 
  const merchantCity = sanitize(city, 15);
  const amountStr = validAmount.toFixed(2);

  const payloadNoCrc = `000201` + formatField("26", payloadKey) + formatField("52", "0000") + formatField("53", "986") + 
    formatField("54", amountStr) + formatField("58", "BR") + formatField("59", merchantName) + 
    formatField("60", merchantCity) + formatField("62", formatField("05", sanitize(txid || 'MERCFACIL', 25))) + `6304`; 

  return `${payloadNoCrc}${calculateCRC16(payloadNoCrc)}`;
};

export const getNetworkTime = async (): Promise<Date> => {
  try {
    const functions = (await import('firebase/functions'));
    const { getFunctions, httpsCallable } = functions;
    const fnHoraServidor = httpsCallable(getFunctions(), 'obterHoraServidor');
    const res = await fnHoraServidor() as any;
    const data = res?.data || {};
    if (data?.hora) {
      return new Date(Number(data.hora));
    }
    return new Date();
  } catch (e) {
    console.warn("Falha ao obter horário do servidor, usando relógio local.");
    return new Date();
  }
};

export const formatarMoeda = (valor: number): string => {
  const safeNumber = isNaN(valor as number) || valor === null || valor === undefined ? 0 : Number(valor);
  const centavos = Math.round(safeNumber * 100) / 100;
  return centavos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Verifica se o role de um documento de usuário é administrador.
 *  O Firestore pode conter 'admin', 'ADMIN', 'master' ou 'MASTER' —
 *  comparação case-insensitive para nunca vazar admin em listas de familiares. */
export const isAdminRole = (role?: string | null | undefined): boolean => {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'master';
};

/** Converte entrada de valor monetário (aceita vírgula ou ponto) em número.
 *  Com vírgula: o ponto é separador de milhar ("1.234,56"). Sem vírgula: o
 *  ponto é decimal ("129.90") — padrão de teclados internacionais. */
export const parseMoeda = (valor: string | number | null | undefined): number => {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
  const s = String(valor).trim();
  if (!s) return 0;
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(limpo);
  return isFinite(n) ? n : 0;
};