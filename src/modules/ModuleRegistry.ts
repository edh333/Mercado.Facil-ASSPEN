export interface SystemExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
}

// O estado inicial das atualizações futuras começa como falso (desativado)
const DEFAULT_EXTENSIONS: SystemExtension[] = [
  {
    id: "nfce_billing",
    name: "Módulo de Emissão Fiscal (NFC-e)",
    description: "Integração futura com a SEFAZ para emissão de nota fiscal eletrônica.",
    version: "1.0.0",
    isEnabled: false
  },
  {
    id: "profit_report",
    name: "Relatório de Lucratividade Bruta/Líquida",
    description: "Cálculo avançado de ROI e margem de lucro baseado no preço de custo.",
    version: "1.0.0",
    isEnabled: false
  }
];

// Fallback em memória para navegadores com localStorage desativado
let memoryFallback: SystemExtension[] | null = null;

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const testKey = '__test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const storageAvailable = typeof window !== 'undefined' ? isLocalStorageAvailable() : false;

export function getInstalledModules(): SystemExtension[] {
  if (typeof window === 'undefined') return DEFAULT_EXTENSIONS;
  if (!storageAvailable) {
    if (!memoryFallback) {
      memoryFallback = [...DEFAULT_EXTENSIONS];
    }
    return memoryFallback;
  }
  const saved = localStorage.getItem("system_extensions_config");
  return saved ? JSON.parse(saved) : DEFAULT_EXTENSIONS;
}

export function saveModuleConfig(config: SystemExtension[]): void {
  if (typeof window === 'undefined') return;
  if (!storageAvailable) {
    memoryFallback = [...config];
    return;
  }
  localStorage.setItem("system_extensions_config", JSON.stringify(config));
}
