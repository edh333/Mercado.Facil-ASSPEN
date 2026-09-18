// DESBLOQUEIO OFFLINE DE EMERGÊNCIA
// Depois do primeiro login ADMIN bem-sucedido em uma máquina, o app guarda um
// hash bcrypt da senha de LOGIN do administrador (nunca a senha em texto).
// Se a internet cair e a sessão do Firebase não puder ser restaurada, o
// operador entra no painel em modo de emergência: vende offline (fila local)
// e as vendas sincronizam sozinhas quando a rede voltar.
//
// Segurança: o hash fica no navegador/PC do próprio caixa (mesmo local onde a
// fila offline já vive). O desbloqueio só é oferecido no app de administrador
// (?mode=admin) quando o dispositivo está genuinamente offline, e a sessão de
// emergência expira sozinha (3h) para não deixar acesso aberto.

import { hash, compare } from 'bcryptjs';

const CRED_KEY = 'mf_offline_admin_cred';
const SESSION_KEY = 'mf_offline_admin_session';
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 horas

export interface OfflineCredential {
  hash: string;
  name: string;
  createdAt: string;
}

export interface OfflineSession {
  name: string;
  expiresAt: number;
}

function tryGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function trySet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* cota cheia / privado */ }
}

function tryRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function hasOfflineCredential(): boolean {
  const raw = tryGet(CRED_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineCredential>;
    return typeof parsed?.hash === 'string' && parsed.hash.length > 0;
  } catch { return false; }
}

export function getOfflineCredential(): OfflineCredential | null {
  const raw = tryGet(CRED_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineCredential>;
    if (typeof parsed?.hash !== 'string' || !parsed.hash) return null;
    return {
      hash: parsed.hash,
      name: typeof parsed.name === 'string' ? parsed.name : 'Administrador',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    };
  } catch { return null; }
}

export async function setOfflineCredential(name: string, password: string): Promise<void> {
  const saltedHash = await hash(String(password), 11);
  trySet(CRED_KEY, JSON.stringify({
    hash: saltedHash,
    name: String(name || 'Administrador'),
    createdAt: new Date().toISOString(),
  } as OfflineCredential));
}

export async function verifyOfflinePassword(password: string): Promise<boolean> {
  const cred = getOfflineCredential();
  if (!cred) return false;
  try { return await compare(String(password), cred.hash); } catch { return false; }
}

export function startOfflineSession(name: string): void {
  trySet(SESSION_KEY, JSON.stringify({
    name: String(name || 'Administrador'),
    expiresAt: Date.now() + SESSION_TTL_MS,
  } as OfflineSession));
}

export function getOfflineSession(): OfflineSession | null {
  const raw = tryGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineSession>;
    if (typeof parsed?.expiresAt !== 'number' || !(parsed.expiresAt > Date.now())) {
      tryRemove(SESSION_KEY);
      return null;
    }
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'Administrador',
      expiresAt: parsed.expiresAt,
    };
  } catch {
    tryRemove(SESSION_KEY);
    return null;
  }
}

export function hasActiveOfflineSession(): boolean {
  return getOfflineSession() !== null;
}

export function clearOfflineSession(): void {
  tryRemove(SESSION_KEY);
}

export function clearOfflineCredential(): void {
  tryRemove(CRED_KEY);
}