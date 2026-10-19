// Harness dos testes de integração das Cloud Functions.
//
// O problema: `functions/index.js` é CJS e faz `require("firebase-admin")` /
// `require("firebase-functions/...")`. O vitest externaliza node_modules, então
// vi.mock/vi.doMock NÃO intercepta esses require (o módulo real seria usado).
//
// A solução robusta: carregar index.js pelo require NATIVO do Node e interceptar
// `Module._load`, devolvendo os mocks. Assim controlamos exatamente o que os
// fluxos enxergam como banco (Firestore em memória) e como emissores
// (onCall/onSchedule = identidade → `exports.fn` É o handler cru).
import { createRequire } from "node:module";
import { createFakeFirestore } from "./fakeFirestore.js";

const require = createRequire(import.meta.url);

export const fake = createFakeFirestore();

export class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "HttpsError";
    this.code = String(code || "unknown").startsWith("functions/")
      ? String(code)
      : "functions/" + code;
    this.details = details;
  }
}

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, log() {} };

const identity = (...a) => a[a.length - 1];

function buildMocks() {
  const adminMock = {
    apps: [],
    initializeApp: () => {},
    firestore: Object.assign(() => fake.db, {
      FieldValue: fake.FieldValue,
      Timestamp: fake.Timestamp,
      FieldPath: fake.FieldPath,
    }),
    auth: () => ({ getUser: (uid) => fake.authGetUser(uid) }),
    // Bucket falso: devolve metadado válido por padrão para qualquer caminho,
    // permitindo testar comprovantes de PIX. Um teste pode sobrescrever
    // fake.storageFiles[caminho] (objeto de metadado) ou definir null para
    // simular arquivo inexistente.
    storage: () => ({
      bucket: () => ({
        file: (caminho) => ({
          getMetadata: async () => {
            const files = fake.storageFiles || {};
            if (Object.prototype.hasOwnProperty.call(files, caminho) && files[caminho] === null) {
              throw new Error("Object does not exist.");
            }
            return [files[caminho] || { size: 262144, contentType: "image/jpeg" }];
          },
        }),
        // Lista de arquivos do bucket (usada por listarBackups). Configure via
        // fake.storageFileList = [{ name, metadata: { size, updated } }].
        getFiles: async () => [fake.storageFileList || []],
      }),
    }),
  };

  const byRequest = {
    "firebase-admin": adminMock,
    "firebase-functions": { logger: noopLogger },
    "firebase-functions/v2": { setGlobalOptions: () => {} },
    "firebase-functions/v2/https": { HttpsError, onCall: identity, onRequest: identity },
    "firebase-functions/v2/scheduler": { onSchedule: identity },
    "firebase-functions/v2/firestore": { onDocumentWritten: identity },
    "firebase-functions/v2/eventarc": { onCustomEventPublished: identity },
  };
  return byRequest;
}

let core = null;

/** Carrega index.js uma única vez com os mocks injetados. */
export function setup() {
  if (core) return core;
  const Module = require("node:module");
  const originalLoad = Module._load;
  const mocks = buildMocks();
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.apply(this, arguments);
  };
  try {
    core = require("../index.js");
  } finally {
    Module._load = originalLoad;
  }
  return core;
}

/**
 * Chama uma callable como se viesse do cliente autenticado `authUid`.
 * Devolve o retorno da função; erros propagam (HttpsError com .code).
 */
export async function call(fnName, data, authUid) {
  const mod = setup();
  const fn = mod[fnName];
  if (typeof fn !== "function") {
    throw new Error(`Função não exportada ou não é callable: ${fnName}`);
  }
  const request = {
    data,
    auth: authUid ? { uid: authUid, token: {} } : null,
    rawRequest: { headers: {} },
  };
  return fn(request);
}
