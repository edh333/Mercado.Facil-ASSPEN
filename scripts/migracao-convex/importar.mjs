#!/usr/bin/env node
/**
 * Importador Convex → Firestore (Mercado Fácil ASSPEN).
 *
 * Dois modos de autenticação (escolha automática):
 *   1. --token=TOKEN  ou env GOOGLE_OAUTH_TOKEN  → REST API do Firestore
 *      (token OAuth com escopo cloud-platform de um OWNER do projeto)
 *   2. scripts/migracao-convex/serviceAccountKey.json → firebase-admin
 *
 * Uso:
 *   node scripts/migracao-convex/importar.mjs --dry-run
 *   node scripts/migracao-convex/importar.mjs --only=users,products
 * Leia INSTRUCOES.md antes de rodar.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join(__dirname, 'export');
const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PROJECT_ID = 'mercado-facil-mt';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyArg = args.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map(s => s.trim()) : null;
const TOKEN = (args.find(a => a.startsWith('--token=')) || {}).split ? args.find(a => a.startsWith('--token=')).split('=').slice(1).join('=') : (process.env.GOOGLE_OAUTH_TOKEN || null);

// ---------- utilidades ----------
const num = v => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
const bool = (v, def = false) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : def);
const iso = v => {
    if (!v) return new Date().toISOString();
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
    const d = new Date(v);
    return isNaN(d) ? new Date().toISOString() : d.toISOString();
};
const pick = (obj, candidates, fallback = undefined) => {
    for (const c of candidates) {
        if (obj[c] !== undefined && obj[c] !== null && obj[c] !== '') return obj[c];
    }
    return fallback;
};

function lerTabela(nome) {
    // Aceita .json (array), .jsonl/.ndjson (um doc por linha) e pastas de export do convex
    for (const ext of ['json', 'jsonl', 'ndjson']) {
        const caminho = path.join(EXPORT_DIR, `${nome}.${ext}`);
        if (!existsSync(caminho)) continue;
        try {
            const raw = readFileSync(caminho, 'utf8').trim();
            if (!raw) return [];
            if (ext === 'json') {
                const j = JSON.parse(raw);
                if (Array.isArray(j)) return j;
                if (Array.isArray(j.documents)) return j.documents;
                if (Array.isArray(j.docs)) return j.docs;
                console.warn(`⚠ ${nome}.json: formato não reconhecido — ignorado.`);
                return [];
            }
            return raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
        } catch (e) {
            console.warn(`⚠ Erro lendo ${nome}.${ext}: ${e.message}`);
            return [];
        }
    }
    // Pasta com documentos soltos (export do dashboard)
    const dir = path.join(EXPORT_DIR, nome);
    if (existsSync(dir)) {
        try {
            return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
        } catch { /* ignora */ }
    }
    return [];
}
import { readdirSync } from 'node:fs';

// ---------- modo REST (token OAuth owner) ----------
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;

function toFsValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
    if (typeof v === 'object') {
        const fields = {};
        for (const [k, val] of Object.entries(v)) if (val !== undefined) fields[k] = toFsValue(val);
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}
function toFsFields(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) fields[k] = toFsValue(v);
    return fields;
}

let restWrites = [];
async function restFlush(force = false) {
    if (restWrites.length === 0) return;
    if (!force && restWrites.length < 400) return;
    const resp = await fetch(`${BASE}/documents:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes: restWrites })
    });
    if (!resp.ok) throw new Error(`Firestore commit falhou (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    restWrites = [];
}
function restQueueDoc(col, id, data) {
    restWrites.push({ update: { name: `${BASE}/documents/${col}/${encodeURIComponent(id)}`, fields: toFsFields(data) } });
}
async function restGetDoc(col, id) {
    const resp = await fetch(`${BASE}/documents/${col}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`GET ${col}/${id}: ${resp.status}`);
    return resp.json();
}

// ---------- modo Admin SDK ----------
let sdkMode = false, adminDb = null;

async function gravar(colecao, docs, resumo) {
    if (!docs.length) { resumo[colecao] = 0; return; }
    if (DRY_RUN) { resumo[colecao] = docs.length; return; }
    if (sdkMode) {
        let batch = adminDb.batch(), pendentes = 0, gravados = 0;
        for (const d of docs) {
            batch.set(adminDb.collection(colecao).doc(d.id), d);
            if (++pendentes >= 400) { await batch.commit(); gravados += pendentes; pendentes = 0; batch = adminDb.batch(); }
        }
        if (pendentes > 0) { await batch.commit(); gravados += pendentes; }
        resumo[colecao] = gravados;
    } else {
        for (const d of docs) restQueueDoc(colecao, d.id, d);
        await restFlush(true);
        resumo[colecao] = docs.length;
    }
}

// ---------- inicialização ----------
if (TOKEN) {
    console.log('▶ Modo: REST API (token OAuth owner).');
} else if (existsSync(KEY_PATH)) {
    let admin, bcryptMod;
    try {
        admin = (await import('firebase-admin')).default;
        bcryptMod = await import('bcryptjs');
    } catch {
        console.error('✗ Rode antes:  npm i --no-save firebase-admin bcryptjs');
        process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) });
    adminDb = admin.firestore();
    sdkMode = true;
    globalThis.__bcrypt = bcryptMod.default || bcryptMod;
    console.log('▶ Modo: firebase-admin (serviceAccountKey.json).');
} else {
    console.error('✗ Sem autenticação: passe --token=TOKEN (OAuth cloud-platform de um owner)');
    console.error('  OU coloque serviceAccountKey.json em scripts/migracao-convex/. Veja INSTRUCOES.md.');
    process.exit(1);
}

const SENHA_TEMP = 'asspen2026';

// ---------- mapeadores ----------
function mapUser(u) {
    const roleRaw = String(pick(u, ['role', 'tipo', 'type'], 'parent')).toLowerCase();
    const isAdmin = ['admin', 'owner', 'dono'].includes(roleRaw);
    const statusRaw = String(pick(u, ['status', 'situation'], '')).toLowerCase();
    const approved = bool(pick(u, ['approved', 'aprovado'], statusRaw === 'active' || statusRaw === 'approved'), false);
    const suspended = statusRaw === 'suspended' || bool(pick(u, ['suspended', 'suspenso'], false));
    const id = String(pick(u, ['_id', 'id'], ''));
    if (!id) return null;
    return {
        id,
        name: String(pick(u, ['name', 'nome', 'fullName'], 'SEM NOME')).toUpperCase(),
        email: String(pick(u, ['email', 'mail'], '')),
        role: isAdmin ? 'ADMIN' : 'FAMILY',
        cpf: String(pick(u, ['cpf', 'documento', 'userCpf'], '')).replace(/\D/g, ''),
        phone: String(pick(u, ['phone', 'telefone', 'whatsapp'], '')),
        prisonerName: String(pick(u, ['prisonerName', 'inmateName', 'nomeInterno'], '')).toUpperCase(),
        prisonerCpf: String(pick(u, ['prisonerCpf', 'inmateCpf', 'cpfInterno'], '')).replace(/\D/g, ''),
        kinship: String(pick(u, ['kinship', 'relationship', 'parentesco'], '')),
        unitId: String(pick(u, ['unitId', 'selectedUnitId', 'unidadeId'], '1')),
        documentUrl: String(pick(u, ['documentUrl', 'docUrl', 'documentoUrl'], '')),
        walletBalance: num(pick(u, ['walletBalance', 'saldo', 'credit', 'credito'], 0)),
        weeklySpent: num(pick(u, ['weeklySpent', 'gastoSemanal'], 0)),
        allowCredit: bool(pick(u, ['allowCredit', 'permiteCredito'], true), true),
        status: suspended ? 'suspended' : (approved ? 'active' : 'pending'),
        approved,
        createdAt: iso(pick(u, ['_creationTime', 'createdAt', 'criadoEm'])),
        migradoDe: 'convex',
        migradoEm: new Date().toISOString()
    };
}

function mapProduct(p) {
    const id = String(pick(p, ['_id', 'id'], ''));
    if (!id || !pick(p, ['name', 'nome'])) return null;
    const active = bool(pick(p, ['active', 'ativo'], true), true);
    return {
        id,
        name: String(pick(p, ['name', 'nome'])).toUpperCase(),
        description: String(pick(p, ['description', 'descricao', 'descrição'], '')),
        price: num(pick(p, ['price', 'preco', 'preço', 'salePrice'], 0)),
        costPrice: num(pick(p, ['costPrice', 'custo', 'cost'], 0)),
        margin: num(pick(p, ['margin', 'margem'], 30)),
        category: String(pick(p, ['category', 'categoria'], 'Geral')),
        imageUrl: String(pick(p, ['imageUrl', 'image', 'foto'], '')),
        stock: Math.max(0, num(pick(p, ['stock', 'estoque', 'quantity', 'qtd'], 0))),
        restricted: bool(pick(p, ['restricted', 'restrito'], false)),
        available: active && bool(pick(p, ['available', 'disponivel', 'disponível'], true), true),
        barcode: String(pick(p, ['barcode', 'ean', 'codigoBarras'], '')),
        ean: String(pick(p, ['ean', 'barcode'], '')),
        brand: String(pick(p, ['brand', 'marca'], '')),
        weight: String(pick(p, ['weight', 'peso', 'unidade'], 'UN')),
        promoPrice: p.promoPrice !== undefined ? num(p.promoPrice) : undefined,
        minStock: p.minStock !== undefined ? num(p.minStock) : undefined,
        createdAt: iso(pick(p, ['_creationTime', 'createdAt'])),
        migradoDe: 'convex',
        migradoEm: new Date().toISOString()
    };
}

function mapOrder(o) {
    const id = String(pick(o, ['_id', 'id'], ''));
    if (!id) return null;
    const itemsRaw = Array.isArray(o.items) ? o.items : Array.isArray(o.products) ? o.products : [];
    const items = itemsRaw.map(it => ({
        productId: String(pick(it, ['productId', 'produtoId', '_id', 'id'], '')),
        quantity: num(pick(it, ['quantity', 'qtd', 'quantidade'], 1)) || 1,
        priceAtPurchase: num(pick(it, ['priceAtPurchase', 'price', 'preco', 'unitPrice'], 0)),
        name: it.name ? String(it.name).toUpperCase() : undefined
    }));
    return {
        id,
        userId: String(pick(o, ['userId', 'parentId', 'usuarioId', 'user_id'], '')),
        userName: o.userName ? String(o.userName).toUpperCase() : undefined,
        userCpf: String(pick(o, ['userCpf', 'cpf'], '')).replace(/\D/g, '') || undefined,
        unitId: String(pick(o, ['unitId', 'unidadeId'], '1')),
        items,
        total: num(pick(o, ['total', 'valorTotal', 'amount'], 0)),
        status: String(pick(o, ['status', 'situacao'], 'Pendente')),
        createdAt: iso(pick(o, ['_creationTime', 'createdAt', 'date'])),
        date: iso(pick(o, ['_creationTime', 'createdAt', 'date'])),
        paymentMethod: ['PIX', 'WALLET', 'CASH', 'CARD', 'MIXED', 'FIADO'].includes(o.paymentMethod) ? o.paymentMethod : 'PIX',
        paymentProofUrl: String(pick(o, ['paymentProofUrl', 'proofUrl', 'comprovante'], '')) || undefined,
        inmateName: o.inmateName ? String(o.inmateName).toUpperCase() : undefined,
        operatorName: o.operatorName ? String(o.operatorName).toUpperCase() : undefined,
        deleted: bool(pick(o, ['deleted', 'deletado'], false)),
        migradoDe: 'convex',
        migradoEm: new Date().toISOString()
    };
}

function mapDeposit(d) {
    const id = String(pick(d, ['_id', 'id'], ''));
    if (!id) return null;
    const statusRaw = String(pick(d, ['status', 'situacao'], 'pending')).toLowerCase();
    const status = ['pending', 'approved', 'rejected'].includes(statusRaw)
        ? statusRaw
        : statusRaw === 'aprovado' ? 'approved' : statusRaw === 'recusado' ? 'rejected' : 'pending';
    return {
        id,
        userId: String(pick(d, ['userId', 'parentId'], '')),
        payerId: String(pick(d, ['userId', 'parentId'], '')),
        inmateCpf: String(pick(d, ['inmateCpf', 'prisonerCpf', 'cpfInterno'], '')).replace(/\D/g, ''),
        inmateName: d.inmateName ? String(d.inmateName).toUpperCase() : undefined,
        amount: num(pick(d, ['amount', 'valor', 'value'], 0)),
        proofUrl: String(pick(d, ['proofUrl', 'receiptUrl', 'comprovante'], '')),
        status,
        type: 'deposit',
        description: 'Depósito migrado do sistema anterior',
        createdAt: iso(pick(d, ['_creationTime', 'createdAt', 'date'])),
        migradoDe: 'convex',
        migradoEm: new Date().toISOString()
    };
}

function mapExpense(e) {
    const id = String(pick(e, ['_id', 'id'], ''));
    if (!id) return null;
    return {
        id,
        description: String(pick(e, ['description', 'descricao', 'descrição', 'title'], 'Despesa migrada')),
        amount: num(pick(e, ['amount', 'valor', 'value'], 0)),
        date: iso(pick(e, ['_creationTime', 'createdAt', 'date'])),
        recipientName: String(pick(e, ['recipientName', 'favorecido', 'supplier'], '')),
        recipientDoc: String(pick(e, ['recipientDoc', 'cnpjOrCpf', 'doc'], '')),
        status: String(pick(e, ['status'], 'PAID')).toUpperCase() === 'PENDING' ? 'PENDING' : 'PAID',
        type: String(pick(e, ['type', 'tipo'], 'OPERATIONAL')).toUpperCase() === 'SUPPLIER' ? 'SUPPLIER' : 'OPERATIONAL',
        observation: e.observation ? String(e.observation) : undefined,
        migradoDe: 'convex',
        migradoEm: new Date().toISOString()
    };
}

function mapMessage(m) {
    const id = String(pick(m, ['_id', 'id'], ''));
    if (!id) return null;
    return {
        id,
        userId: String(pick(m, ['userId', 'parentId', 'authorId'], '')),
        text: String(pick(m, ['text', 'conteudo', 'content', 'message', 'body'], '')),
        date: iso(pick(m, ['_creationTime', 'createdAt', 'date'])),
        read: bool(pick(m, ['read', 'lida'], false)),
        fromAdmin: bool(pick(m, ['fromAdmin', 'isAdmin', 'doAdmin'], false)),
        migradoDe: 'convex',
        migradoEm: new Date().toISOString()
    };
}

// ---------- execução ----------
const resumo = {};
const tabelas = {
    users: lerTabela('users'),
    products: lerTabela('products'),
    orders: lerTabela('orders'),
    deposits: lerTabela('deposits'),
    expenses: lerTabela('expenses'),
    messages: lerTabela('messages'),
    promissories: lerTabela('promissories'),
    settings: lerTabela('settings')
};
const totalArquivos = Object.values(tabelas).reduce((a, b) => a + b.length, 0);
if (totalArquivos === 0) {
    console.error('✗ Nenhum arquivo em scripts/migracao-convex/export/. Veja INSTRUCOES.md Passo 1.');
    process.exit(1);
}
console.log(`▶ Migração ${DRY_RUN ? '(SIMULAÇÃO)' : 'REAL'} — ${totalArquivos} documentos lidos.\n`);

// USERS
if (!ONLY || ONLY.includes('users')) {
    const users = tabelas.users.map(mapUser).filter(Boolean);
    await gravar('users', users, resumo);
    if (!DRY_RUN && users.length) {
        const hashTemp = sdkMode ? globalThis.__bcrypt.hashSync(SENHA_TEMP, 10) : (await import('bcryptjs')).default.hashSync(SENHA_TEMP, 10);
        for (const u of users) {
            if (sdkMode) {
                await adminDb.collection('auth_secrets').doc(u.id).set({ password: hashTemp, updatedAt: new Date().toISOString(), migrado: true }, { merge: true });
            } else {
                const existente = await restGetDoc('auth_secrets', u.id);
                const campos = existente ? existente.fields || {} : {};
                campos.password = { stringValue: hashTemp };
                campos.updatedAt = { stringValue: new Date().toISOString() };
                campos.migrado = { booleanValue: true };
                restWrites.push({ update: { name: `${BASE}/documents/auth_secrets/${encodeURIComponent(u.id)}`, fields: campos } });
                await restFlush();
            }
        }
        console.log(`• auth_secrets: senha temporária "${SENHA_TEMP}" definida para ${users.length} usuário(s).`);
    }
}

// PRODUCTS
if (!ONLY || ONLY.includes('products')) {
    await gravar('products', tabelas.products.map(mapProduct).filter(Boolean), resumo);
}

// ORDERS
if (!ONLY || ONLY.includes('orders')) {
    await gravar('orders', tabelas.orders.map(mapOrder).filter(Boolean), resumo);
}

// DEPOSITS → wallet_transactions
if (!ONLY || ONLY.includes('deposits')) {
    await gravar('wallet_transactions', tabelas.deposits.map(mapDeposit).filter(Boolean), resumo);
}

// EXPENSES
if (!ONLY || ONLY.includes('expenses')) {
    await gravar('expenses', tabelas.expenses.map(mapExpense).filter(Boolean), resumo);
}

// MESSAGES
if (!ONLY || ONLY.includes('messages')) {
    await gravar('messages', tabelas.messages.map(mapMessage).filter(Boolean), resumo);
}

// PROMISSORIES → coleção de conferência
if (!ONLY || ONLY.includes('promissories')) {
    const proms = tabelas.promissories.map(p => {
        const id = String(pick(p, ['_id', 'id'], ''));
        if (!id) return null;
        const copia = { ...p };
        delete copia._id;
        return { ...copia, id, migradoDe: 'convex', migradoEm: new Date().toISOString() };
    }).filter(Boolean);
    await gravar('migracao_promissorias', proms, resumo);
}

// SETTINGS → settings/general (chaves seguras, merge)
if ((!ONLY || ONLY.includes('settings')) && tabelas.settings.length) {
    const s = tabelas.settings[0];
    const seguras = {};
    const pix = pick(s, ['pixKey', 'pix', 'chavePix']);
    if (pix) seguras.pixKey = String(pix);
    const cnpj = pick(s, ['cnpj', 'companyCnpj']);
    if (cnpj) seguras.cnpj = String(cnpj);
    const nome = pick(s, ['appName', 'storeName', 'nomeLoja']);
    if (nome) seguras.appName = String(nome);
    if (Object.keys(seguras).length) {
        if (!DRY_RUN) {
            if (sdkMode) {
                await adminDb.collection('settings').doc('general').set(seguras, { merge: true });
            } else {
                const atual = await restGetDoc('settings', 'general');
                const campos = atual ? atual.fields || {} : {};
                for (const [k, v] of Object.entries(seguras)) campos[k] = toFsValue(v);
                restWrites.push({ update: { name: `${BASE}/documents/settings/general`, fields: campos } });
                await restFlush(true);
            }
        }
        resumo['settings/general'] = Object.keys(seguras).length;
    }
}

console.log('\n===== RESUMO =====');
for (const [k, v] of Object.entries(resumo)) console.log(`  ${k}: ${v}`);
if (DRY_RUN) console.log('\n(Simulação — nada foi gravado. Rode sem --dry-run para importar.)');
else console.log('\n✓ Migração concluída. Confira os dados no app e comunique a senha temporária aos usuários.');
process.exit(0);
