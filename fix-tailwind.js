const fs = require('fs');
const path = require('path');

// Mapa de correções para classes Tailwind inválidas
const corrections = {
    'p-2.5': 'p-2',
    'py-2.5': 'py-2',
    'p-1.5': 'p-2',
    'py-1.5': 'py-2',
    'p-3.5': 'p-4',
    'py-3.5': 'py-4',
    'p-4.5': 'p-4',
    'py-4.5': 'py-4',
    'px-2.5': 'px-2',
    'py-2.5': 'py-2',
    '-translate-x-1/2': '-translate-x-1/2',
    '-translate-y-1/2': '-translate-y-1/2',
    'text-[10px]': 'text-xs',
    'text-[9px]': 'text-[9px]', // Este é válido com colchetes
    'tracking-widest': 'tracking-widest',
    'bg-slate-900/90': 'bg-slate-900/90',
    'backdrop-blur-sm': 'backdrop-blur-sm',
    'rounded-2xl': 'rounded-2xl',
    'rounded-3xl': 'rounded-3xl',
    'rounded-[2.5rem]': 'rounded-3xl',
    'rounded-[1.5rem]': 'rounded-2xl',
    'w-[90%]': 'w-[90%]',
    'max-w-[400px]': 'max-w-[400px]',
    'gap-1.5': 'gap-2',
    'gap-2.5': 'gap-2',
    'gap-3.5': 'gap-4',
    'gap-4.5': 'gap-4',
    'mt-0.5': 'mt-2',
    'mb-0.5': 'mb-2',
    'pt-0.5': 'pt-2',
    'pb-0.5': 'pb-2',
    'ml-0.5': 'ml-2',
    'mr-0.5': 'mr-2',
    'left-0.5': 'left-2',
    'right-0.5': 'right-2',
    'top-0.5': 'top-2',
    'bottom-0.5': 'bottom-2',
    'h-1.5': 'h-2',
    'w-1.5': 'w-2',
    'text-[11px]': 'text-sm',
    'bg-white/10': 'bg-white/10',
    'bg-white/20': 'bg-white/20',
    'bg-slate-50/95': 'bg-slate-50/95',
    'bg-slate-100/50': 'bg-slate-100/50',
};

function fixFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        Object.keys(corrections).forEach(invalid => {
            const valid = corrections[invalid];
            if (content.includes(invalid)) {
                content = content.replace(new RegExp(escapeRegExp(invalid), 'g'), valid);
                modified = true;
            }
        });
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('✅ Fixed: ' + filePath);
        }
    } catch (e) {
        console.error('❌ Error fixing ' + filePath + ': ' + e.message);
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Arquivos para corrigir
const filesToFix = [
    'pages/UserDashboard.tsx',
    'pages/Login.tsx',
    'components/user/UserCartModal.tsx',
    'components/user/UserStoreTab.tsx',
    'components/admin/AdminModals.tsx',
    'components/admin/AdminFinanceTab.tsx',
    'components/admin/AdminSettingsTab.tsx',
    'components/NotificationSystem.tsx',
    'App.tsx',
    'index.css'
];

console.log('🔧 Iniciando correção de classes Tailwind inválidas...');
filesToFix.forEach(f => {
    const fullPath = path.join(__dirname, f);
    if (fs.existsSync(fullPath)) {
        fixFile(fullPath);
    } else {
        console.log('⚠️ Arquivo não encontrado: ' + fullPath);
    }
});

console.log('✅ Correção concluída!');
