import { describe, it, expect } from 'vitest';
import {
  contentTypeParaArquivo, ehFalhaDeUploadPermanente, extensaoDe,
  mensagemFalhaPermanente, MAX_PROOF_BYTES, MIME_POR_EXTENSAO,
} from '../utils/proofUpload';

describe('extensaoDe', () => {
  it('extrai a extensão em minúsculas', () => {
    expect(extensaoDe('comprovante.JPG')).toBe('.jpg');
    expect(extensaoDe('print do pix.Pdf')).toBe('.pdf');
  });

  it('devolve string vazia quando não há extensão utilizável', () => {
    expect(extensaoDe('comprovante')).toBe('');
    expect(extensaoDe('.oculto')).toBe('');
    expect(extensaoDe('arquivo.')).toBe('');
  });
});

describe('contentTypeParaArquivo', () => {
  it('usa a extensão quando o Blob NÃO tem type (caso real no Android/Windows)', () => {
    // Sem isto o @firebase/storage envia 'application/octet-stream'
    // (determineContentType_) e a regra do Storage REJEITA para sempre.
    expect(contentTypeParaArquivo({ name: 'comprovante.jpg', type: '' })).toBe('image/jpeg');
    expect(contentTypeParaArquivo({ name: 'comprovante.pdf', type: '' })).toBe('application/pdf');
  });

  it('substitui MIME genérico pela extensão', () => {
    expect(contentTypeParaArquivo({ name: 'a.png', type: 'application/octet-stream' })).toBe('image/png');
    expect(contentTypeParaArquivo({ name: 'a.webp', type: 'binary/octet-stream' })).toBe('image/webp');
  });

  it('respeita um MIME válido declarado pelo navegador', () => {
    expect(contentTypeParaArquivo({ name: 'a.jpg', type: 'image/jpeg' })).toBe('image/jpeg');
    expect(contentTypeParaArquivo({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf');
    expect(contentTypeParaArquivo({ name: 'a.heic', type: 'image/heic' })).toBe('image/heic');
  });

  it('ignora parâmetros do MIME (ex.: "image/jpeg; charset=...")', () => {
    expect(contentTypeParaArquivo({ name: 'a.jpg', type: 'image/jpeg; charset=utf-8' })).toBe('image/jpeg');
  });

  it('rejeita extensão fora da whitelist (retorna null)', () => {
    expect(contentTypeParaArquivo({ name: 'malware.exe', type: '' })).toBeNull();
    expect(contentTypeParaArquivo({ name: 'planilha.xlsx', type: '' })).toBeNull();
    expect(contentTypeParaArquivo({ name: 'video.mp4', type: 'video/mp4' })).toBeNull();
    expect(contentTypeParaArquivo({ name: 'documento', type: '' })).toBeNull();
  });

  it('cobre exatamente os MIME aceitos pelas regras do Storage', () => {
    const aceitos = new Set(Object.values(MIME_POR_EXTENSAO));
    for (const mime of aceitos) {
      // a rule: image/(png|jpeg|jpg|heic|heif|webp|bmp) | application/pdf
      const valido = mime === 'application/pdf'
        || /^image\/(png|jpeg|jpg|heic|heif|webp|bmp)$/.test(mime);
      expect(valido, `${mime} não é aceito pela regra`).toBe(true);
    }
  });
});

describe('ehFalhaDeUploadPermanente', () => {
  it('trata recusa da REGRA/permissão como permanente', () => {
    expect(ehFalhaDeUploadPermanente({ code: 'storage/unauthorized' })).toBe(true);
    expect(ehFalhaDeUploadPermanente({ code: 'storage/invalid-argument' })).toBe(true);
    expect(ehFalhaDeUploadPermanente({ code: 'storage/quota-exceeded' })).toBe(true);
    expect(ehFalhaDeUploadPermanente({ code: 'storage/unauthenticated' })).toBe(true);
  });

  it('trata falha de REDE como transitória (vai para a fila offline)', () => {
    expect(ehFalhaDeUploadPermanente({ code: 'storage/retry-limit-exceeded' })).toBe(false);
    expect(ehFalhaDeUploadPermanente({ code: 'storage/deadline-exceeded' })).toBe(false);
    expect(ehFalhaDeUploadPermanente({ code: 'storage/internal-error' })).toBe(false);
    expect(ehFalhaDeUploadPermanente({ message: 'Failed to fetch' })).toBe(false);
    expect(ehFalhaDeUploadPermanente(new Error('network error'))).toBe(false);
  });

  it('erro sem código é considerado transitório (não descarta o comprovante)', () => {
    expect(ehFalhaDeUploadPermanente(undefined)).toBe(false);
    expect(ehFalhaDeUploadPermanente({})).toBe(false);
  });

  it('o erro real do Storage (unauthorized por MIME) NÃO vira fila offline', () => {
    // Regressão do bug: comprovante rejeitado para sempre ficava na fila
    // local e o depósito nunca era liberado.
    const erroReal = { code: 'storage/unauthorized', message: 'User not authorized to perform this request.' };
    expect(ehFalhaDeUploadPermanente(erroReal)).toBe(true);
  });
});

describe('mensagemFalhaPermanente', () => {
  it('dá uma orientação útil por tipo de falha', () => {
    expect(mensagemFalhaPermanente({ code: 'storage/quota-exceeded' })).toMatch(/espaço/i);
    expect(mensagemFalhaPermanente({ code: 'storage/invalid-argument' })).toMatch(/8 MB/i);
    expect(mensagemFalhaPermanente({ code: 'storage/unauthenticated' })).toMatch(/sessão/i);
    expect(mensagemFalhaPermanente({ code: 'storage/unauthorized' }).length).toBeGreaterThan(10);
  });
});

describe('MAX_PROOF_BYTES', () => {
  it('bate com o limite ESTRITO da regra (< 8 MB), não com <=', () => {
    expect(MAX_PROOF_BYTES).toBe(8 * 1024 * 1024);
    // storage.rules: request.resource.size < 8 * 1024 * 1024
    expect(MAX_PROOF_BYTES - 1).toBeLessThan(8 * 1024 * 1024);
  });
});