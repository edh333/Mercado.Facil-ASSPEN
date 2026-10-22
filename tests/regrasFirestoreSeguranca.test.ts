// GUARDA DAS REGRAS DO FIRESTORE (firestore.rules).
//
// As regras são a barreira FINAL: o que a UI bloqueia pode ser contornado por
// um updateDoc direto no console do navegador. Estes testes leem o arquivo de
// regras e travam as proteções que movem dinheiro, para que uma edição futura
// das regras não abra brecha sem o build acusar.
//
// O que é verificado aqui:
//  1) pedido: status TERMINAL (cancelado/estornado/rejeitado) não pode ser
//     escrito pelo cliente — só o status operacional;
//  2) pedido, usuário e transação de carteira: SEM hard delete pelo cliente
//     (soft delete + auditoria no servidor).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REGRAS = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

/** Extrai o bloco de um `match /colecao/{id} { ... }` contando as chaves. */
function bloco(match: string): string {
  const inicio = REGRAS.indexOf(match);
  if (inicio < 0) throw new Error(`Match não encontrado nas regras: ${match}`);
  let i = REGRAS.indexOf('{', inicio + match.length - 1);
  let profundidade = 0;
  for (; i < REGRAS.length; i++) {
    if (REGRAS[i] === '{') profundidade++;
    else if (REGRAS[i] === '}') {
      profundidade--;
      if (profundidade === 0) return REGRAS.slice(REGRAS.indexOf('{', inicio), i + 1);
    }
  }
  throw new Error(`Bloco não fechado: ${match}`);
}

const STATUS_TERMINAIS = [
  'cancelled', 'cancelado',
  'refunded', 'devolvido', 'estornado', 'reembolsado',
  'rejected', 'rejeitado',
];

describe('firestore.rules — proteção do pedido', () => {
  const pedido = bloco('match /orders/{orderId}');

  it('não permite hard delete de pedido pelo cliente', () => {
    expect(pedido).toMatch(/allow delete:\s*if false;/);
    expect(pedido).not.toMatch(/allow delete:\s*if isAdmin\(\);/);
  });

  it('escreve no cliente apenas status operacional', () => {
    // A lista de status graváveis pelo cliente (whitelist da regra).
    const lista = pedido.match(/request\.resource\.data\.status in \[([^\]]+)\]/);
    expect(lista).toBeTruthy();

    const permitidos = (lista![1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));
    expect(permitidos.length).toBeGreaterThan(0);
    expect(permitidos).toContain('preparing');
    expect(permitidos).toContain('delivered');

    // Nenhum status TERMINAL pode ser escrito pelo cliente: cancelamento,
    // estorno e reprovação devolvem estoque, carteira, fiado e gaveta no
    // SERVIDOR (com senha mestra e audit log).
    for (const terminal of STATUS_TERMINAIS) {
      expect(permitidos).not.toContain(terminal);
    }
  });
});

describe('firestore.rules — hard delete fora do servidor', () => {
  it('usuário: exclusão é SOFT (server-side, com auditoria)', () => {
    const usuarios = bloco('match /users/{userId}');
    expect(usuarios).toMatch(/allow delete:\s*if false;/);
    expect(usuarios).not.toMatch(/allow delete:\s*if isAdmin\(\);/);
  });

  it('transação de carteira: dinheiro não se apaga pelo cliente', () => {
    const tx = bloco('match /wallet_transactions/{txId}');
    expect(tx).toMatch(/allow delete:\s*if false;/);
    expect(tx).not.toMatch(/allow delete:\s*if isAdmin\(\);/);
  });
});
