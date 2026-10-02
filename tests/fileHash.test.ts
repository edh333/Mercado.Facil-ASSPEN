// Dedup de comprovantes por SHA-256.
//
// Pergunta que motivou este teste: "como o sistema sabe que o PDF é igual ao
// JPEG?" — A resposta: NÃO sabe, e isso é uma limitação real. Ele compara o
// HASH DOS BYTES do arquivo. PDF e JPEG são formatos diferentes, então nunca
// geram o mesmo hash — nem quando mostram o mesmo pagamento.
//
// O que estes testes fixam é o comportamento que realmente importa:
//  - o MESMO arquivo reenviado (em qualquer formato) é sempre barrado;
//  - arquivos diferentes NUNCA geram colisão de hash;
//  - JPEG recomprimido / redimensionado NÃO é detectado (limite conhecido).

import { describe, it, expect } from 'vitest';
import { computeFileHash, isProofSuspiciouslySmall, MIN_PROOF_BYTES } from '../utils/fileHash';

const bytes = (...n: number[]) => new Uint8Array(n);

describe('computeFileHash', () => {
  it('o mesmo PDF sempre gera o mesmo hash (reenvio é barrado)', async () => {
    const pdf = new Blob([bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x37)], { type: 'application/pdf' });
    const h1 = await computeFileHash(pdf);
    const h2 = await computeFileHash(pdf);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('o mesmo JPEG sempre gera o mesmo hash', async () => {
    const jpg = new Blob([bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10)], { type: 'image/jpeg' });
    expect(await computeFileHash(jpg)).toBe(await computeFileHash(jpg));
  });

  it('hash é hexadecimal de 64 chars (SHA-256)', async () => {
    const h = await computeFileHash(new Blob([bytes(1, 2, 3)], { type: 'image/png' }));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('conhecido: SHA-256 do vazio é o valor canônico e2b1c1a4...', async () => {
    // Âncora contra erro de implementação (ordem de bytes, padding).
    expect(await computeFileHash(new Blob([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('um byte diferente já muda o hash (sem colisão trivial)', async () => {
    const a = await computeFileHash(new Blob([bytes(1, 2, 3, 4)], { type: 'image/jpeg' }));
    const b = await computeFileHash(new Blob([bytes(1, 2, 3, 5)], { type: 'image/jpeg' }));
    expect(a).not.toBe(b);
  });

  it('arquivos grandes não truncam nem estouram memória', async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    big.fill(7);
    const h = await computeFileHash(new Blob([big], { type: 'image/jpeg' }));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('o hash cobre SÓ os bytes: renomear PDF→JPEG não engana o dedup', async () => {
    // O hash ignora o rótulo MIME. Dois blobs com os mesmos bytes e tipos
    // declarados diferentes geram o MESMO hash — logo trocar a extensão
    // (ou o content-type) NÃO contorna a detecção de duplicidade.
    // É o comportamento desejado: o bloqueio é do conteúdo, não do rótulo.
    const conteudo = bytes(0xde, 0xad, 0xbe, 0xef, 0x42);
    const comoPdf = await computeFileHash(new Blob([conteudo], { type: 'application/pdf' }));
    const comoJpeg = await computeFileHash(new Blob([conteudo], { type: 'image/jpeg' }));
    expect(comoPdf).toBe(comoJpeg);
  });

  it('LIMITE CONHECIDO: JPEG recomprimido NÃO é detectado como duplicado', async () => {
    // Reexportar a mesma foto pelo celular/app muda os bytes => hash muda =>
    // passa. Este teste documenta a limitação para não prometer o que o
    // sistema não faz. Fechar essa brecha exigiria hash perceptual ou OCR,
    // que NÃO existem hoje (ver relatório ao cliente).
    const original = new Blob([bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x01)], { type: 'image/jpeg' });
    const recomprimido = new Blob([bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x02)], { type: 'image/jpeg' });
    expect(await computeFileHash(original)).not.toBe(await computeFileHash(recomprimido));
  });

  it('LIMITE CONHECIDO: PDF re-gerado (mesma imagem, metadados novos) passa', async () => {
    // Exportar de novo o mesmo comprovante em PDF costuma gravar um /CreationDate
    // diferente -> bytes diferentes -> hash diferente -> não bloqueado.
    const p1 = new Blob([bytes(0x25, 0x50, 0x44, 0x46, 0x01, 0x00)], { type: 'application/pdf' });
    const p2 = new Blob([bytes(0x25, 0x50, 0x44, 0x46, 0x01, 0x01)], { type: 'application/pdf' });
    expect(await computeFileHash(p1)).not.toBe(await computeFileHash(p2));
  });
});

describe('isProofSuspiciouslySmall', () => {
  it('corta comprovante minúsculo (print de PDF em branco, etc.)', () => {
    expect(isProofSuspiciouslySmall(MIN_PROOF_BYTES - 1)).toBe(true);
  });

  it('aceita arquivo no limite ou acima', () => {
    expect(isProofSuspiciouslySmall(MIN_PROOF_BYTES)).toBe(false);
    expect(isProofSuspiciouslySmall(MIN_PROOF_BYTES * 10)).toBe(false);
  });
});