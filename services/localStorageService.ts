// Declare electronAPI globally if it exists
declare const electronAPI: any;

const LOCALStorage = {
    KEY: 'mercado_facil_backup',
    DIR: 'data/local',

    save: (key: string, data: any) => {
        try {
            const json = JSON.stringify(data);
            localStorage.setItem(`${LOCALStorage.KEY}_${key}`, json);
            
            // Also save to file system if available (Electron)
            if (window.electronAPI?.saveFile) {
                window.electronAPI.saveFile(`${LOCALStorage.DIR}/${key}.json`, json);
            }
            return true;
        } catch (e) {
            console.error('LocalStorage save error:', e);
            return false;
        }
    },

    load: (key: string): any => {
        try {
            const json = localStorage.getItem(`${LOCALStorage.KEY}_${key}`);
            return json ? JSON.parse(json) : null;
        } catch (e) {
            console.error('LocalStorage load error:', e);
            return null;
        }
    },

    list: (): string[] => {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(LOCALStorage.KEY)) {
                keys.push(key.replace(`${LOCALStorage.KEY}_`, ''));
            }
        }
        return keys;
    },

    clear: () => {
        const keys = LOCALStorage.list();
        keys.forEach(key => localStorage.removeItem(`${LOCALStorage.KEY}_${key}`));
    }
};

// Export data for backup
const exportBackup = async () => {
    const data = {
        exportedAt: new Date().toISOString(),
        users: (window as any).dbUsers || [],
        products: (window as any).dbProducts || [],
        orders: (window as any).dbOrders || [],
        expenses: (window as any).dbExpenses || []
    };
    return LOCALStorage.save('backup', data);
};

// Import backup
const importBackup = (backupData: any) => {
    if (backupData.users) (window as any).dbUsers = backupData.users;
    if (backupData.products) (window as any).dbProducts = backupData.products;
    if (backupData.orders) (window as any).dbOrders = backupData.orders;
    if (backupData.expenses) (window as any).dbExpenses = backupData.expenses;
};

export { LOCALStorage, exportBackup, importBackup };
// -- Fila de comprovantes pendentes (IndexedDB) -----------------------------
// Quando o upload não pode ser concluído (sem internet, falha de rede), o
// arquivo é guardado aqui e reenviado automaticamente quando a conexão voltar.
const DB_NAME = 'mercado_facil_uploads';
const DB_STORE = 'pending';

const openUploadDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
            req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

export const queuePendingUpload = async (entry: { id: string; folder: string; fileName: string; kind?: string; docId?: string; blob: Blob }): Promise<void> => {
    const db = await openUploadDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(entry);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
};

export const listPendingUploads = async (): Promise<any[]> => {
    try {
        const db = await openUploadDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readonly');
            const req = tx.objectStore(DB_STORE).getAll();
            req.onsuccess = () => { db.close(); resolve(req.result || []); };
            req.onerror = () => { db.close(); reject(req.error); };
        });
    } catch (e) {
        return [];
    }
};

export const removePendingUpload = async (id: string): Promise<void> => {
    const db = await openUploadDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
};

export const attachPendingUploadDoc = async (folder: string, docId: string): Promise<boolean> => {
    try {
        const pendentes = await listPendingUploads();
        const alvo = pendentes.find(p => p.folder === folder && !p.docId);
        if (!alvo) return false;
        await queuePendingUpload({ ...alvo, docId });
        return true;
    } catch (e) {
        return false;
    }
};
