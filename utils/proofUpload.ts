// Validação do upload de comprovantes: MIME, tamanho e classificação de erro.
//
// Contexto crítico: o Storage NÃO confia na extensão do arquivo. A rule
// (storage.rules) valida `request.resource.contentType` contra a whitelist
// image/(png|jpeg|jpg|heic|heif|webp|bmp)|application/pdf. O SDK do Firebase,
// quando o Blob não tem `type`, envia 'application/octet-stream'
// (determineContentType_ no @firebase/storage) — que a rule REJEITA.
//
// Na prática isso atingia o familiar: no Android/Windows o seletor às vezes
// entrega comprovante com `type: ''` (arquivo vindo de WhatsApp/Drive ou
// renomeado). O cliente validava só a extensão e aceitava; o Storage recusava
// para sempre; o erro era engolido como "conexão instável", o comprovante
// ficava preso na fila offline e o depósito ficava pending com
// proofUrl = "PENDENTE_UPLOAD_LOCAL_CACHE" — dinheiro pago, crédito que só
// sairia se o usuário descobrisse o botão "reenviar comprovante".

/** MIME aceito pelas regras, por extensão de arquivo. */
export const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export const EXTENSOES_PERMITIDAS = Object.keys(MIME_POR_EXTENSAO);

export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

/** Extensão do arquivo, em minúsculas, com o ponto ("", ".jpg"). */
export function extensaoDe(nome: string): string {
  const base = String(nome || '');
  const corte = base.lastIndexOf('.');
  if (corte <= 0 || corte === base.length - 1) return '';
  return base.slice(corte).toLowerCase();
}

/**
 * MIME a enviar no upload, derivado da EXTENSÃO quando o Blob não traz tipo
 * confiável. Devolve null quando a extensão não é aceita (o chamador valida).
 *
 * Prioridade para o `type` do Blob: se ele for um MIME da whitelist, respeitado
 * (PDF de banco chega como 'application/pdf'). Se estiver vazio ou genérico
 * ('application/octet-stream', 'application/binary', 'image/jpg'), usamos a
 * extensão — senão a rule rejeita um comprovante perfectly válido.
 */
export function contentTypeParaArquivo(file: { name?: string; type?: string }): string | null {
  const ext = extensaoDe(file?.name || '').replace('.', '');
  const mimeDaExtensao = MIME_POR_EXTENSAO[ext];
  if (!mimeDaExtensao) return null;

  const declarado = String(file?.type || '').toLowerCase().split(';')[0].trim();
  const generico = declarado === '' || declarado === 'application/octet-stream'
    || declarado === 'application/binary' || declarado === 'binary/octet-stream';
  if (!generico) return declarado;
  return mimeDaExtensao;
}

/**
 * Falha PERMANENTE: repetir não vai resolver (regra, permissão, cota, tipo ou
 * tamanho inválido). Sem esta classificação o erro era tratado como falta de
 * rede, o arquivo ia para a fila offline e era reprocessado a cada login,
 * para sempre, sem nunca concluir.
 *
 * Tudo o que NÃO está na lista é considerado transitório — a decisão segura
 * para o usuário é tentar de novo depois em vez de devolver "falhou".
 */
export function ehFalhaDeUploadPermanente(error: unknown): boolean {
  const bruto = error as any;
  const code = String(bruto?.code || bruto?.name || bruto?.message || '').toLowerCase();
  if (!code) return false;
  return [
    'storage/unauthorized',
    'storage/forbidden',
    'storage/unauthenticated',
    'storage/invalid-argument',
    'storage/quota-exceeded',
    'storage/payload-too-large',
    'storage/object-not-found',
    'permission-denied',
    'unauthorized',
    'invalid-argument',
    'quota-exceeded',
    'payload-too-large',
  ].some((c) => code.includes(c));
}

/** Mensagem legível para o familiar quando o upload falha de vez. */
export function mensagemFalhaPermanente(error: unknown): string {
  const code = String((error as any)?.code || '').toLowerCase();
  if (code.includes('quota-exceeded')) {
    return 'O armazenamento do sistema está sem espaço no momento. Tente novamente mais tarde ou procure a administração.';
  }
  if (code.includes('payload-too-large') || code.includes('invalid-argument')) {
    return 'O arquivo não foi aceito pelo servidor (tamanho ou tipo). Use uma foto JPG/PNG ou um PDF de até 8 MB.';
  }
  if (code.includes('unauthenticated')) {
    return 'Sua sessão expirou. Entre novamente e reenvie o comprovante.';
  }
  return 'O comprovante não foi aceito pelo servidor. Selecione o arquivo novamente ou procure a administração.';
}