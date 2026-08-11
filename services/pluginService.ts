export interface ExtensionFeature {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon?: string;
  route?: string;
  tab?: string;
  position: 'START' | 'MIDDLE' | 'END';
  component?: string;
  onClick?: string;
  badge?: string;
}

export interface ExtensionConfig {
  version: string;
  features: ExtensionFeature[];
  metadata?: {
    author?: string;
    lastUpdated?: string;
  };
}

const DEFAULT_CONFIG: ExtensionConfig = {
  version: '1.0.0',
  features: [],
  metadata: {
    author: 'MercadoFacil Team',
    lastUpdated: new Date().toISOString().split('T')[0]
  }
};

let cachedConfig: ExtensionConfig | null = null;

export const loadExtensionConfig = async (): Promise<ExtensionConfig> => {
  if (cachedConfig) return cachedConfig;
  
  try {
    const stored = localStorage.getItem('extensionConfig');
    if (stored) {
      cachedConfig = JSON.parse(stored) as ExtensionConfig;
      return cachedConfig!;
    }
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig!;
  } catch (e) {
    console.warn('[PluginService] Falha ao carregar configuracao de extensoes:', e);
    return DEFAULT_CONFIG;
  }
};

export const saveExtensionConfig = async (config: ExtensionConfig): Promise<void> => {
  try {
    localStorage.setItem('extensionConfig', JSON.stringify(config));
    cachedConfig = config;
  } catch (e) {
    console.error('[PluginService] Falha ao salvar configuracao:', e);
  }
};

export const registerFeature = async (feature: ExtensionFeature): Promise<void> => {
  const config = await loadExtensionConfig();
  const exists = config.features.some(f => f.id === feature.id);
  if (!exists) {
    config.features.push({ ...feature, enabled: true });
    await saveExtensionConfig(config);
  }
};

export const unregisterFeature = async (featureId: string): Promise<void> => {
  const config = await loadExtensionConfig();
  config.features = config.features.filter(f => f.id !== featureId);
  await saveExtensionConfig(config);
};

export const getEnabledFeatures = async (): Promise<ExtensionFeature[]> => {
  const config = await loadExtensionConfig();
  return config.features
    .filter(f => f.enabled)
    .sort((a, b) => {
      const order = { START: 0, MIDDLE: 1, END: 2 };
      return order[a.position] - order[b.position];
    });
};

export const getFeaturesByTab = async (tab: string): Promise<ExtensionFeature[]> => {
  const features = await getEnabledFeatures();
  return features.filter(f => f.tab === tab);
};

export const getFeaturesByRoute = async (route: string): Promise<ExtensionFeature[]> => {
  const features = await getEnabledFeatures();
  return features.filter(f => f.route === route);
};

export const createFeatureFromConfig = (feature: ExtensionFeature) => {
  return {
    id: feature.id,
    name: feature.name,
    description: feature.description,
    enabled: feature.enabled,
    icon: feature.icon,
    badge: feature.badge,
    position: feature.position
  };
};

export const generateDefaultConfig = (): ExtensionConfig => {
  return {
    ...DEFAULT_CONFIG,
    features: [],
    metadata: {
      author: 'MercadoFacil Team',
      lastUpdated: new Date().toISOString().split('T')[0]
    }
  };
};