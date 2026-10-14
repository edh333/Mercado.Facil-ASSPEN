interface Window {
  electronAPI?: {
    isElectron: () => boolean;
    printHtmlSilent: (html: string, deviceName?: string) => Promise<{ ok: boolean; error?: string }>;
    closeWindow: () => void;
    saveFile: (filePath: string, data: string) => Promise<boolean>;
    saveBackup: (fileName: string, data: unknown) => Promise<string>;
    selectFolder: () => Promise<string | undefined>;
    createShortcut: () => Promise<string>;
    getAppMode: () => Promise<'admin' | 'user'>;
    getAppVersion: () => Promise<string>;
    checkUpdate: () => Promise<{ current: string; latest: string; updateAvailable: boolean; webUrl: string; releasedAt: string }>;
    openUpdate: (url?: string) => Promise<boolean>;
  };
}
