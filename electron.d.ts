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
  };
}
