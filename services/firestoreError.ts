import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// Interceptação global de erros de asserção interna do Firestore (ID: 8815)
// Impede que o erro "FIRESTORE INTERNAL ASSERTION FAILED" chegue ao usuário
if (typeof window !== 'undefined') {
  const origOnError = window.onerror;
  window.onerror = (msg, url, line, col, error) => {
    const text = typeof msg === 'string' ? msg : '';
    if (text.includes('FIRESTORE INTERNAL ASSERTION') || text.includes('UNEXPECTED STATE') || text.includes('ID: 8815')) {
      console.warn('[Firestore] Assertion error suprimido:', text);
      return true;
    }
    return origOnError ? origOnError.call(window, msg, url, line, col, error) : false;
  };

  window.addEventListener('unhandledrejection', (event) => {
    const text = event.reason?.message || event.reason?.toString() || '';
    if (text.includes('FIRESTORE INTERNAL ASSERTION') || text.includes('UNEXPECTED STATE') || text.includes('ID: 8815')) {
      event.preventDefault();
      console.warn('[Firebase] Promise de asserção rejeitada suprimida:', text);
    }
  }, true);
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  // Log SEM dados pessoais (LGPD): nunca imprime email/UID completo no console —
  // apenas o ID truncado para correlação no suporte.
  console.error('Firestore Error: ', {
    error: errInfo.error,
    operationType,
    path,
    userId: errInfo.authInfo.userId ? `${String(errInfo.authInfo.userId).slice(0, 8)}…` : undefined,
  });
  return errInfo;
}
