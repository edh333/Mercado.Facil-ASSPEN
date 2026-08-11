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