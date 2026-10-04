import { describe, it, expect } from 'vitest';
import {
  ErrorCodes,
  getUserMessage,
  getTechMessage,
  getSuggestedActions,
  createStandardError,
  httpsErrorToErrorCode,
  errorToStandardError,
} from '../utils/errorMessages';

describe('errorMessages — padronização de erros', () => {
  describe('httpsErrorToErrorCode', () => {
    it('mapeia códigos HTTP para ErrorCode', () => {
      expect(httpsErrorToErrorCode({ code: 'unauthenticated' })).toBe(ErrorCodes.AUTH_REQUIRED);
      expect(httpsErrorToErrorCode({ code: 'permission-denied' })).toBe(ErrorCodes.PERMISSION_DENIED);
      expect(httpsErrorToErrorCode({ code: 'not-found' })).toBe(ErrorCodes.USER_NOT_FOUND);
      expect(httpsErrorToErrorCode({ code: 'already-exists' })).toBe(ErrorCodes.ALREADY_EXISTS);
      expect(httpsErrorToErrorCode({ code: 'invalid-argument' })).toBe(ErrorCodes.INVALID_VALUE);
      expect(httpsErrorToErrorCode({ code: 'internal' })).toBe(ErrorCodes.SERVER_ERROR);
      expect(httpsErrorToErrorCode({ code: 'unavailable' })).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
    });

    it('fallback por mensagem quando código não mapeado', () => {
      expect(httpsErrorToErrorCode({ message: 'CPF inválido' })).toBe(ErrorCodes.INVALID_CPF);
      expect(httpsErrorToErrorCode({ message: 'Senha incorreta' })).toBe(ErrorCodes.PASSWORD_INCORRECT);
      expect(httpsErrorToErrorCode({ message: 'Comprovante duplicado' })).toBe(ErrorCodes.DUPLICATE_PROOF);
      expect(httpsErrorToErrorCode({ message: 'Estoque insuficiente' })).toBe(ErrorCodes.INSUFFICIENT_STOCK);
      expect(httpsErrorToErrorCode({ message: 'Saldo insuficiente' })).toBe(ErrorCodes.INSUFFICIENT_BALANCE);
    });
  });

  describe('getUserMessage', () => {
    it('retorna mensagem amigável para códigos conhecidos', () => {
      expect(getUserMessage(ErrorCodes.INVALID_CPF)).toContain('CPF inválido');
      expect(getUserMessage(ErrorCodes.INSUFFICIENT_BALANCE)).toContain('Saldo insuficiente');
      expect(getUserMessage(ErrorCodes.DUPLICATE_PROOF)).toContain('já foi usado');
      expect(getUserMessage(ErrorCodes.MASTER_PASSWORD_REQUIRED)).toContain('senha mestra');
    });

    it('interpola parâmetros na mensagem', () => {
      const msg = getUserMessage(ErrorCodes.INSUFFICIENT_BALANCE, { balance: '50,00' });
      expect(msg).toContain('50,00');
      expect(msg).not.toContain('{balance}');
    });

    it('retorna fallback para código desconhecido', () => {
      const msg = getUserMessage('UNKNOWN_CODE' as any);
      expect(msg).toContain('inesperado');
    });
  });

  describe('getTechMessage', () => {
    it('retorna mensagem técnica em inglês', () => {
      expect(getTechMessage(ErrorCodes.INVALID_CPF)).toBe('Invalid CPF');
      expect(getTechMessage(ErrorCodes.PERMISSION_DENIED)).toBe('Permission denied');
    });
  });

  describe('getSuggestedActions', () => {
    it('retorna ações sugeridas não vazias', () => {
      expect(getSuggestedActions(ErrorCodes.INVALID_CPF)).toContain('Digite 11 dígitos numéricos');
      expect(getSuggestedActions(ErrorCodes.NETWORK_ERROR)).toContain('Verifique sua internet');
      expect(getSuggestedActions(ErrorCodes.MASTER_PASSWORD_REQUIRED)).toContain('Contate o administrador se esqueceu');
    });
  });

  describe('createStandardError', () => {
    it('cria objeto padronizado completo', () => {
      const err = createStandardError(ErrorCodes.INSUFFICIENT_BALANCE, { balance: '50,00' });
      expect(err.code).toBe(ErrorCodes.INSUFFICIENT_BALANCE);
      expect(err.userMessage).toContain('50,00');
      expect(err.techMessage).toBe('Insufficient balance');
      expect(Array.isArray(err.actions)).toBe(true);
      expect(err.actions.length).toBeGreaterThan(0);
    });
  });

  describe('httpsErrorToErrorCode — mapeamentos específicos', () => {
    it('mapeia mensagens de comprovante duplicado', () => {
      expect(httpsErrorToErrorCode({ message: 'comprovante já utilizado' })).toBe(ErrorCodes.DUPLICATE_PROOF);
      expect(httpsErrorToErrorCode({ message: 'proof already used' })).toBe(ErrorCodes.DUPLICATE_PROOF);
    });

    it('mapeia mensagens de estoque', () => {
      expect(httpsErrorToErrorCode({ message: 'estoque insuficiente' })).toBe(ErrorCodes.INSUFFICIENT_STOCK);
      expect(httpsErrorToErrorCode({ message: 'stock insufficient' })).toBe(ErrorCodes.INSUFFICIENT_STOCK);
    });

    it('mapeia senha mestra', () => {
      expect(httpsErrorToErrorCode({ message: 'senha mestra incorreta' })).toBe(ErrorCodes.MASTER_PASSWORD_INCORRECT);
      expect(httpsErrorToErrorCode({ message: 'master password' })).toBe(ErrorCodes.MASTER_PASSWORD_INCORRECT);
    });
  });

describe('errorToStandardError', () => {
  it('converte Error genérico', () => {
    const err = errorToStandardError(new Error('qualquer coisa'));
    expect(err.code).toBe(ErrorCodes.SERVER_ERROR);
    expect(err.userMessage).toContain('Tente novamente');
  });

  it('converte HttpsError-like', () => {
      const err = errorToStandardError({ code: 'permission-denied', message: 'Acesso negado' });
      expect(err.code).toBe(ErrorCodes.PERMISSION_DENIED);
    });
  });
});