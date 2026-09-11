// Hash SHA-256 de arquivos no navegador (Web Crypto API nativa — zero dependências).
// É a identidade do comprovante: o MESMO arquivo gera SEMPRE o mesmo hash, mesmo que
// o upload gere um filename aleatório novo. Salvo nos documentos (order/wallet_transaction)
// e consultado pelo servidor para recusar reutilização de comprovantes (fraude
// de print reenviado para múltiplos depósitos/pedidos).

export async function computeFileHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export interface ProofMeta {
  hash: string;
  size: number;
  mime: string;
}

export async function computeProofMeta(blob: Blob): Promise<ProofMeta> {
  return {
    hash: await computeFileHash(blob),
    size: blob.size,
    mime: blob.type || 'application/octet-stream',
  };
}

// Um comprovante REAL (foto impressa, screenshot de app bancário, PDF do banco)
// sempre tem mais que 3 KB. Abaixo disso é provavelmente arquivo vazio/fragmento
// — bloqueado para reduzir fraude e lixo no storage.
export const MIN_PROOF_BYTES = 3 * 1024;

export function isProofSuspiciouslySmall(bytes: number): boolean {
  return bytes > 0 && bytes < MIN_PROOF_BYTES;
}