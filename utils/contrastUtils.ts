// Utilitário profissional para contraste de texto
// Funciona com classes Tailwind arbitrárias (bg-[#xxx]) e nomes de cores

export const extractHexFromTailwind = (twClass: string): string | null => {
  // Extrai #hex de bg-[#rrggbb] ou text-[#rrggbb]
  const match = twClass.match(/#([0-9a-fA-F]{3,6})/);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  return '#' + hex;
};

export const getBrightness = (hex: string): number => {
  const h = hex.replace('#','');
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0]+h[0],16);
    g = parseInt(h[1]+h[1],16);
    b = parseInt(h[2]+h[2],16);
  } else {
    r = parseInt(h.substr(0,2),16);
    g = parseInt(h.substr(2,2),16);
    b = parseInt(h.substr(4,2),16);
  }
  return (r*299 + g*587 + b*114) / 1000;
};

export const getTextColorForBg = (bgClassOrHex: string): string => {
  // Tenta extrair hex da classe Tailwind
  let hex = extractHexFromTailwind(bgClassOrHex);
  
  // Se não encontrou, tenta mapear cores Tailwind comuns
  if (!hex) {
    const map: Record<string,string> = {
      'bg-black':'#000000','bg-white':'#ffffff',
      'bg-slate-50':'#f8fafc','bg-slate-100':'#f1f5f9','bg-slate-200':'#e2e8f0',
      'bg-slate-700':'#334155','bg-slate-800':'#1e293b','bg-slate-900':'#0f172a','bg-slate-950':'#020617',
      'bg-gray-100':'#f3f4f6','bg-gray-200':'#e5e7eb','bg-gray-700':'#374151','bg-gray-800':'#1f2937','bg-gray-900':'#111827',
      'bg-emerald-400':'#34d399','bg-emerald-500':'#10b981','bg-emerald-600':'#059669','bg-emerald-700':'#047857','bg-emerald-800':'#065f46','bg-emerald-900':'#064e3b',
      'bg-blue-600':'#2563eb','bg-blue-700':'#1d4ed8',
      'bg-purple-700':'#7c3aed',
      'bg-orange-600':'#ea580c',
      'bg-yellow-400':'#facc15','bg-yellow-500':'#eab308',
      'bg-amber-400':'#fbbf24','bg-amber-500':'#f59e0b',
      'bg-rose-400':'#fb7185','bg-pink-400':'#f472b6',
      'bg-cyan-400':'#22d3ee','bg-sky-400':'#38bdf8',
      'bg-green-400':'#4ade80','bg-lime-400':'#a3e635',
    };
    for (const [key,val] of Object.entries(map)) {
      if (bgClassOrHex.includes(key)) { hex = val; break; }
    }
  }
  
  if (!hex) hex = '#059669'; // fallback
  const brightness = getBrightness(hex);
  return brightness > 128 ? '!text-slate-900' : '!text-white';
};

export const isLightBackground = (bgClassOrHex: string): boolean => {
  return getTextColorForBg(bgClassOrHex) === '!text-slate-900';
};
