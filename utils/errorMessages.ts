/**
 * Utilitário centralizado de mensagens de erro.
 * Padroniza códigos, mensagens ao usuário e ações sugeridas.
 * Evita duplicação e garante tom consistente (amigável, acionável, sem jargão técnico).
 */

// Códigos de erro padronizados (frontend + backend compartilham)
export const ErrorCodes = {
  // Autenticação / Sessão
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_PENDING: 'ACCOUNT_PENDING',
  PASSWORD_INCORRECT: 'PASSWORD_INCORRECT',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  MASTER_PASSWORD_INCORRECT: 'MASTER_PASSWORD_INCORRECT',
  MASTER_PASSWORD_REQUIRED: 'MASTER_PASSWORD_REQUIRED',

  // Permissão / Autorização
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  FINANCE_PERMISSION_REQUIRED: 'FINANCE_PERMISSION_REQUIRED',
  CASH_PERMISSION_REQUIRED: 'CASH_PERMISSION_REQUIRED',
  OWNERSHIP_REQUIRED: 'OWNERSHIP_REQUIRED',

  // Validação de entrada
  INVALID_CPF: 'INVALID_CPF',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_VALUE: 'INVALID_VALUE',
  INVALID_FILE: 'INVALID_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  INVALID_CREDIT_LIMIT: 'INVALID_CREDIT_LIMIT',
  INVALID_CREDIT_AMOUNT: 'INVALID_CREDIT_AMOUNT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Recursos
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  CASH_SESSION_NOT_FOUND: 'CASH_SESSION_NOT_FOUND',
  BACKUP_NOT_FOUND: 'BACKUP_NOT_FOUND',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',

  // Conflitos / Duplicatas
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CPF_ALREADY_REGISTERED: 'CPF_ALREADY_REGISTERED',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  PROOF_ALREADY_USED: 'PROOF_ALREADY_USED',
  DUPLICATE_PROOF: 'DUPLICATE_PROOF',
  USER_ALREADY_LINKED: 'USER_ALREADY_LINKED',
  CREDIT_LIMIT_EXCEEDED: 'CREDIT_LIMIT_EXCEEDED',

  // Estado inválido
  ACCOUNT_PENDING_APPROVAL: 'ACCOUNT_PENDING_APPROVAL',
  ORDER_ALREADY_CANCELLED: 'ORDER_ALREADY_CANCELLED',
  ORDER_ALREADY_APPROVED: 'ORDER_ALREADY_APPROVED',
  ORDER_ALREADY_COMPLETED: 'ORDER_ALREADY_COMPLETED',
  CASH_SESSION_CLOSED: 'CASH_SESSION_CLOSED',
  CASH_SESSION_ALREADY_OPEN: 'CASH_SESSION_ALREADY_OPEN',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_CASH: 'INSUFFICIENT_CASH',
  INSUFFICIENT_CREDIT: 'INSUFFICIENT_CREDIT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  ORDER_PENDING_PROOF: 'ORDER_PENDING_PROOF',
  ORDER_CANCELLATION_WINDOW_EXPIRED: 'ORDER_CANCELLATION_WINDOW_EXPIRED',
  MASTER_PASSWORD_NOT_SET: 'MASTER_PASSWORD_NOT_SET',

  // Arquivos / Upload
  FILE_EMPTY: 'FILE_EMPTY',
  FILE_TOO_BIG: 'FILE_TOO_BIG',
  INVALID_FILE_FORMAT: 'INVALID_FILE_FORMAT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  PROOF_UPLOAD_PENDING: 'PROOF_UPLOAD_PENDING',

  // Rede / Sistema
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  BACKUP_FAILED: 'BACKUP_FAILED',
  RESTORE_FAILED: 'RESTORE_FAILED',

  // Caixa / Financeiro
  CASH_LIMIT_EXCEEDED: 'CASH_LIMIT_EXCEEDED',
  CREDIT_LIMIT_EXCEEDED_ADMIN: 'CREDIT_LIMIT_EXCEEDED_ADMIN',
  WEEKLY_LIMIT_EXCEEDED: 'WEEKLY_LIMIT_EXCEEDED',
  DAILY_WITHDRAWAL_LIMIT_EXCEEDED: 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED',
  MINIMUM_ACCOUNT_AGE: 'MINIMUM_ACCOUNT_AGE',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// Mensagens amigáveis para o usuário final (pt-BR)
const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCodes.AUTH_REQUIRED]: 'Você precisa estar logado para fazer isso. Entre na sua conta e tente novamente.',
  [ErrorCodes.SESSION_EXPIRED]: 'Sua sessão expirou. Por favor, faça login novamente.',
  [ErrorCodes.INVALID_CREDENTIALS]: 'CPF ou senha incorretos. Verifique e tente novamente.',
  [ErrorCodes.ACCOUNT_SUSPENDED]: 'Sua conta está suspensa. Entre em contato com a administração.',
  [ErrorCodes.ACCOUNT_PENDING]: 'Seu cadastro está em análise. Aguarde a aprovação do administrador.',
  [ErrorCodes.PASSWORD_INCORRECT]: 'Senha incorreta. Tente novamente.',
  [ErrorCodes.PASSWORD_TOO_WEAK]: 'A senha deve ter pelo menos 6 caracteres.',
  [ErrorCodes.MASTER_PASSWORD_INCORRECT]: 'Senha mestra incorreta. Tente novamente.',
  [ErrorCodes.MASTER_PASSWORD_REQUIRED]: 'Esta ação exige a senha mestra. Digite a senha mestra para continuar.',

  [ErrorCodes.PERMISSION_DENIED]: 'Você não tem permissão para fazer isso. Contate o administrador se precisar de acesso.',
  [ErrorCodes.ADMIN_REQUIRED]: 'Apenas administradores podem fazer isso.',
  [ErrorCodes.FINANCE_PERMISSION_REQUIRED]: 'Permissão de finanças necessária. Solicite ao administrador.',
  [ErrorCodes.CASH_PERMISSION_REQUIRED]: 'Permissão de caixa necessária. Solicite ao administrador.',
  [ErrorCodes.OWNERSHIP_REQUIRED]: 'Você só pode acessar seus próprios dados.',

  [ErrorCodes.INVALID_CPF]: 'CPF inválido. Verifique os 11 dígitos e tente novamente.',
  [ErrorCodes.INVALID_EMAIL]: 'E-mail inválido. Verifique o formato (ex: usuario@dominio.com).',
  [ErrorCodes.INVALID_PASSWORD]: 'Senha inválida. Deve ter pelo menos 6 caracteres.',
  [ErrorCodes.INVALID_VALUE]: 'Valor inválido. Digite um número válido e positivo.',
  [ErrorCodes.INVALID_FILE]: 'Arquivo inválido. Selecione um arquivo válido.',
  [ErrorCodes.FILE_TOO_LARGE]: 'Arquivo muito grande. Tamanho máximo: 8 MB.',
  [ErrorCodes.INVALID_FILE_TYPE]: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF, HEIC ou WEBP.',
  [ErrorCodes.INVALID_CREDIT_LIMIT]: 'Limite de crédito inválido. Máximo: R$ 1.000.000,00.',
  [ErrorCodes.INVALID_CREDIT_AMOUNT]: 'Valor de crédito inválido. Digite um valor válido.',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Campo obrigatório não preenchido.',

  [ErrorCodes.USER_NOT_FOUND]: 'Usuário não encontrado. Verifique o CPF ou ID.',
  [ErrorCodes.ORDER_NOT_FOUND]: 'Pedido não encontrado. Verifique o ID.',
  [ErrorCodes.PRODUCT_NOT_FOUND]: 'Produto não encontrado.',
  [ErrorCodes.CASH_SESSION_NOT_FOUND]: 'Sessão de caixa não encontrada.',
  [ErrorCodes.BACKUP_NOT_FOUND]: 'Backup não encontrado. Verifique o nome do arquivo.',
  [ErrorCodes.TRANSACTION_NOT_FOUND]: 'Transação não encontrada.',

  [ErrorCodes.ALREADY_EXISTS]: 'Este registro já existe.',
  [ErrorCodes.CPF_ALREADY_REGISTERED]: 'Já existe um cadastro com este CPF.',
  [ErrorCodes.EMAIL_ALREADY_REGISTERED]: 'Já existe uma conta com este e-mail.',
  [ErrorCodes.PROOF_ALREADY_USED]: 'Este comprovante já foi usado em outro pedido. Cada comprovante só vale uma vez.',
  [ErrorCodes.DUPLICATE_PROOF]: 'Este comprovante já foi usado em outro pedido. Cada comprovante só vale uma vez.',
  [ErrorCodes.USER_ALREADY_LINKED]: 'Este usuário já possui conta vinculada.',
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED]: 'Limite de crédito excedido. O cliente possui apenas R$ {available} de limite disponível.',

  [ErrorCodes.ACCOUNT_PENDING_APPROVAL]: 'Cadastro em análise. Aguarde a aprovação do administrador.',
  [ErrorCodes.ORDER_ALREADY_CANCELLED]: 'Este pedido já foi cancelado.',
  [ErrorCodes.ORDER_ALREADY_APPROVED]: 'Este pedido já foi aprovado.',
  [ErrorCodes.ORDER_ALREADY_COMPLETED]: 'Este pedido já foi finalizado.',
  [ErrorCodes.CASH_SESSION_CLOSED]: 'Esta sessão de caixa já foi encerrada.',
  [ErrorCodes.CASH_SESSION_ALREADY_OPEN]: 'Você já tem um caixa aberto. Feche o atual antes de abrir outro.',
  [ErrorCodes.INSUFFICIENT_BALANCE]: 'Saldo insuficiente na carteira. Disponível: R$ {balance}.',
  [ErrorCodes.INSUFFICIENT_CASH]: 'Saldo em caixa insuficiente. Disponível: R$ {balance}.',
  [ErrorCodes.INSUFFICIENT_CREDIT]: 'Limite de crédito insuficiente. Disponível: R$ {available}.',
  [ErrorCodes.INSUFFICIENT_STOCK]: 'Estoque insuficiente. Disponível: {stock} unidades.',
  [ErrorCodes.ORDER_PENDING_PROOF]: 'Pedido aguardando comprovante. Anexe o comprovante antes de aprovar.',
  [ErrorCodes.ORDER_CANCELLATION_WINDOW_EXPIRED]: 'Cancelamento bloqueado: esta venda foi feita há mais de {days} dias. Use a aba de Pedidos para estorno.',
  [ErrorCodes.MASTER_PASSWORD_NOT_SET]: 'Senha mestra não configurada. Configure nas Configurações > Segurança.',

  [ErrorCodes.FILE_EMPTY]: 'Arquivo vazio. Selecione um arquivo válido.',
  [ErrorCodes.FILE_TOO_BIG]: 'Arquivo muito grande. Tamanho máximo: 8 MB.',
  [ErrorCodes.INVALID_FILE_FORMAT]: 'Tipo de arquivo não permitido. Use JPG, PNG, PDF, HEIC ou WEBP.',
  [ErrorCodes.UPLOAD_FAILED]: 'Falha no upload. Verifique sua conexão e tente novamente.',
  [ErrorCodes.PROOF_UPLOAD_PENDING]: 'Conexão instável: o comprovante foi guardado e será enviado automaticamente quando a internet voltar.',

  [ErrorCodes.NETWORK_ERROR]: 'Sem conexão com a internet. Verifique sua conexão e tente novamente.',
  [ErrorCodes.SERVER_ERROR]: 'Erro interno do servidor. Tente novamente em instantes.',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
  [ErrorCodes.RATE_LIMITED]: 'Muitas tentativas. Aguarde um momento e tente novamente.',
  [ErrorCodes.BACKUP_FAILED]: 'Falha ao gerar backup. O histórico no Firestore já preserva tudo. Tente novamente.',
  [ErrorCodes.RESTORE_FAILED]: 'Falha ao restaurar backup. Tente novamente ou contate o suporte.',

  [ErrorCodes.CASH_LIMIT_EXCEEDED]: 'Valor excede o teto de R$ 10.000,00 por operação.',
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED_ADMIN]: 'Limite de crédito excede o teto de R$ 1.000.000,00.',
  [ErrorCodes.WEEKLY_LIMIT_EXCEEDED]: 'Limite semanal de carteira excedido. Tente novamente na próxima semana.',
  [ErrorCodes.DAILY_WITHDRAWAL_LIMIT_EXCEEDED]: 'Limite diário de saque excedido (R$ 1.000,00/dia).',
  [ErrorCodes.MINIMUM_ACCOUNT_AGE]: 'Conta muito nova para saque. Aguarde 24 horas após o cadastro.',
} as const;

// Mensagens técnicas para logs (backend)
const TECH_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCodes.AUTH_REQUIRED]: 'Authentication required',
  [ErrorCodes.SESSION_EXPIRED]: 'Session expired',
  [ErrorCodes.INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCodes.ACCOUNT_SUSPENDED]: 'Account suspended',
  [ErrorCodes.ACCOUNT_PENDING]: 'Account pending approval',
  [ErrorCodes.PASSWORD_INCORRECT]: 'Incorrect password',
  [ErrorCodes.PASSWORD_TOO_WEAK]: 'Password too weak',
  [ErrorCodes.MASTER_PASSWORD_INCORRECT]: 'Master password incorrect',
  [ErrorCodes.MASTER_PASSWORD_REQUIRED]: 'Master password required',

  [ErrorCodes.PERMISSION_DENIED]: 'Permission denied',
  [ErrorCodes.ADMIN_REQUIRED]: 'Admin required',
  [ErrorCodes.FINANCE_PERMISSION_REQUIRED]: 'Finance permission required',
  [ErrorCodes.CASH_PERMISSION_REQUIRED]: 'Cash permission required',
  [ErrorCodes.OWNERSHIP_REQUIRED]: 'Ownership required',

  [ErrorCodes.INVALID_CPF]: 'Invalid CPF',
  [ErrorCodes.INVALID_EMAIL]: 'Invalid email',
  [ErrorCodes.INVALID_PASSWORD]: 'Invalid password',
  [ErrorCodes.INVALID_VALUE]: 'Invalid value',
  [ErrorCodes.INVALID_FILE]: 'Invalid file',
  [ErrorCodes.FILE_TOO_LARGE]: 'File too large',
  [ErrorCodes.FILE_TOO_BIG]: 'File too big',
  [ErrorCodes.INVALID_FILE_TYPE]: 'Invalid file type',
  [ErrorCodes.INVALID_CREDIT_LIMIT]: 'Invalid credit limit',
  [ErrorCodes.INVALID_CREDIT_AMOUNT]: 'Invalid credit amount',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Missing required field',

  [ErrorCodes.USER_NOT_FOUND]: 'User not found',
  [ErrorCodes.ORDER_NOT_FOUND]: 'Order not found',
  [ErrorCodes.PRODUCT_NOT_FOUND]: 'Product not found',
  [ErrorCodes.CASH_SESSION_NOT_FOUND]: 'Cash session not found',
  [ErrorCodes.BACKUP_NOT_FOUND]: 'Backup not found',
  [ErrorCodes.TRANSACTION_NOT_FOUND]: 'Transaction not found',

  [ErrorCodes.ALREADY_EXISTS]: 'Already exists',
  [ErrorCodes.CPF_ALREADY_REGISTERED]: 'CPF already registered',
  [ErrorCodes.EMAIL_ALREADY_REGISTERED]: 'Email already registered',
  [ErrorCodes.PROOF_ALREADY_USED]: 'Proof already used',
  [ErrorCodes.DUPLICATE_PROOF]: 'Duplicate proof',
  [ErrorCodes.USER_ALREADY_LINKED]: 'User already linked',
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED]: 'Credit limit exceeded',

  [ErrorCodes.ACCOUNT_PENDING_APPROVAL]: 'Account pending approval',
  [ErrorCodes.ORDER_ALREADY_CANCELLED]: 'Order already cancelled',
  [ErrorCodes.ORDER_ALREADY_APPROVED]: 'Order already approved',
  [ErrorCodes.ORDER_ALREADY_COMPLETED]: 'Order already completed',
  [ErrorCodes.CASH_SESSION_CLOSED]: 'Cash session closed',
  [ErrorCodes.CASH_SESSION_ALREADY_OPEN]: 'Cash session already open',
  [ErrorCodes.INSUFFICIENT_BALANCE]: 'Insufficient balance',
  [ErrorCodes.INSUFFICIENT_CASH]: 'Insufficient cash',
  [ErrorCodes.INSUFFICIENT_CREDIT]: 'Insufficient credit',
  [ErrorCodes.INSUFFICIENT_STOCK]: 'Insufficient stock',
  [ErrorCodes.ORDER_PENDING_PROOF]: 'Order pending proof',
  [ErrorCodes.ORDER_CANCELLATION_WINDOW_EXPIRED]: 'Order cancellation window expired',
  [ErrorCodes.MASTER_PASSWORD_NOT_SET]: 'Master password not set',

  [ErrorCodes.FILE_EMPTY]: 'File empty',
  [ErrorCodes.INVALID_FILE_FORMAT]: 'Invalid file format',
  [ErrorCodes.UPLOAD_FAILED]: 'Upload failed',
  [ErrorCodes.PROOF_UPLOAD_PENDING]: 'Proof upload pending',

  [ErrorCodes.NETWORK_ERROR]: 'Network error',
  [ErrorCodes.SERVER_ERROR]: 'Server error',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Service unavailable',
  [ErrorCodes.RATE_LIMITED]: 'Rate limited',
  [ErrorCodes.BACKUP_FAILED]: 'Backup failed',
  [ErrorCodes.RESTORE_FAILED]: 'Restore failed',

  [ErrorCodes.CASH_LIMIT_EXCEEDED]: 'Cash limit exceeded',
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED_ADMIN]: 'Credit limit exceeded admin',
  [ErrorCodes.WEEKLY_LIMIT_EXCEEDED]: 'Weekly limit exceeded',
  [ErrorCodes.DAILY_WITHDRAWAL_LIMIT_EXCEEDED]: 'Daily withdrawal limit exceeded',
  [ErrorCodes.MINIMUM_ACCOUNT_AGE]: 'Minimum account age',
} as const;

// Ações sugeridas para o usuário
const SUGGESTED_ACTIONS: Record<ErrorCode, string[]> = {
  [ErrorCodes.AUTH_REQUIRED]: ['Faça login novamente'],
  [ErrorCodes.SESSION_EXPIRED]: ['Faça login novamente'],
  [ErrorCodes.INVALID_CREDENTIALS]: ['Verifique CPF e senha', 'Use "Esqueci a senha" se necessário'],
  [ErrorCodes.ACCOUNT_SUSPENDED]: ['Contate a administração'],
  [ErrorCodes.ACCOUNT_PENDING]: ['Aguarde aprovação'],
  [ErrorCodes.PASSWORD_INCORRECT]: ['Tente novamente', 'Use "Esqueci a senha"'],
  [ErrorCodes.PASSWORD_TOO_WEAK]: ['Use pelo menos 6 caracteres'],
  [ErrorCodes.MASTER_PASSWORD_INCORRECT]: ['Tente novamente', 'Contate o administrador se esqueceu'],
  [ErrorCodes.MASTER_PASSWORD_REQUIRED]: ['Digite a senha mestra no campo indicado', 'Contate o administrador se esqueceu'],

  [ErrorCodes.PERMISSION_DENIED]: ['Contate o administrador para solicitar acesso'],
  [ErrorCodes.ADMIN_REQUIRED]: ['Apenas administradores podem acessar'],
  [ErrorCodes.FINANCE_PERMISSION_REQUIRED]: ['Solicite permissão de finanças ao administrador'],
  [ErrorCodes.CASH_PERMISSION_REQUIRED]: ['Solicite permissão de caixa ao administrador'],
  [ErrorCodes.OWNERSHIP_REQUIRED]: ['Acesse apenas seus próprios dados'],

  [ErrorCodes.INVALID_CPF]: ['Digite 11 dígitos numéricos'],
  [ErrorCodes.INVALID_EMAIL]: ['Verifique o formato do e-mail'],
  [ErrorCodes.INVALID_PASSWORD]: ['Use pelo menos 6 caracteres'],
  [ErrorCodes.INVALID_VALUE]: ['Digite um número válido'],
  [ErrorCodes.INVALID_FILE]: ['Selecione um arquivo válido'],
  [ErrorCodes.FILE_TOO_LARGE]: ['Comprima a imagem ou use PDF menor que 8 MB'],
  [ErrorCodes.INVALID_FILE_TYPE]: ['Use JPG, PNG, PDF, HEIC ou WEBP'],
  [ErrorCodes.INVALID_CREDIT_LIMIT]: ['Máximo: R$ 1.000.000,00'],
  [ErrorCodes.INVALID_CREDIT_AMOUNT]: ['Digite um valor válido'],
  [ErrorCodes.MISSING_REQUIRED_FIELD]: ['Preencha todos os campos obrigatórios'],

  [ErrorCodes.USER_NOT_FOUND]: ['Verifique o CPF ou ID'],
  [ErrorCodes.ORDER_NOT_FOUND]: ['Verifique o ID do pedido'],
  [ErrorCodes.PRODUCT_NOT_FOUND]: ['Verifique o produto'],
  [ErrorCodes.CASH_SESSION_NOT_FOUND]: ['Abra ou selecione uma sessão de caixa'],
  [ErrorCodes.BACKUP_NOT_FOUND]: ['Verifique o nome do arquivo de backup'],
  [ErrorCodes.TRANSACTION_NOT_FOUND]: ['Verifique o ID da transação'],

  [ErrorCodes.ALREADY_EXISTS]: ['Este registro já existe'],
  [ErrorCodes.CPF_ALREADY_REGISTERED]: ['Use o CPF já cadastrado para login'],
  [ErrorCodes.EMAIL_ALREADY_REGISTERED]: ['Use o e-mail já cadastrado para login'],
  [ErrorCodes.PROOF_ALREADY_USED]: ['Cada comprovante só pode ser usado uma vez'],
  [ErrorCodes.DUPLICATE_PROOF]: ['Cada comprovante só pode ser usado uma vez'],
  [ErrorCodes.USER_ALREADY_LINKED]: ['Use a conta já vinculada para login'],
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED]: ['Verifique o limite disponível do cliente'],

  [ErrorCodes.ACCOUNT_PENDING_APPROVAL]: ['Aguarde o administrador aprovar'],
  [ErrorCodes.ORDER_ALREADY_CANCELLED]: ['Este pedido já foi cancelado'],
  [ErrorCodes.ORDER_ALREADY_APPROVED]: ['Este pedido já foi aprovado'],
  [ErrorCodes.ORDER_ALREADY_COMPLETED]: ['Este pedido já foi finalizado'],
  [ErrorCodes.CASH_SESSION_CLOSED]: ['Esta sessão de caixa já foi encerrada'],
  [ErrorCodes.CASH_SESSION_ALREADY_OPEN]: ['Feche o caixa atual antes de abrir outro'],
  [ErrorCodes.INSUFFICIENT_BALANCE]: ['Verifique o saldo disponível'],
  [ErrorCodes.INSUFFICIENT_CASH]: ['Verifique o saldo em caixa'],
  [ErrorCodes.INSUFFICIENT_CREDIT]: ['Verifique o limite de crédito disponível'],
  [ErrorCodes.INSUFFICIENT_STOCK]: ['Verifique o estoque disponível'],
  [ErrorCodes.ORDER_PENDING_PROOF]: ['Anexe o comprovante antes de aprovar'],
  [ErrorCodes.ORDER_CANCELLATION_WINDOW_EXPIRED]: ['Use a aba "Pedidos" para estorno administrativo'],
  [ErrorCodes.MASTER_PASSWORD_NOT_SET]: ['Configure em Configurações > Segurança'],

  [ErrorCodes.FILE_EMPTY]: ['Selecione um arquivo válido'],
  [ErrorCodes.FILE_TOO_BIG]: ['Comprima a imagem ou use PDF menor que 8 MB'],
  [ErrorCodes.INVALID_FILE_FORMAT]: ['Use JPG, PNG, PDF, HEIC ou WEBP'],
  [ErrorCodes.UPLOAD_FAILED]: ['Verifique sua conexão e tente novamente'],
  [ErrorCodes.PROOF_UPLOAD_PENDING]: ['Aguarde a conexão voltar; o envio é automático'],

  [ErrorCodes.NETWORK_ERROR]: ['Verifique sua internet', 'Tente novamente'],
  [ErrorCodes.SERVER_ERROR]: ['Tente novamente em instantes'],
  [ErrorCodes.SERVICE_UNAVAILABLE]: ['Aguarde alguns minutos e tente novamente'],
  [ErrorCodes.RATE_LIMITED]: ['Aguarde alguns minutos'],

  [ErrorCodes.CASH_LIMIT_EXCEEDED]: ['Máximo: R$ 10.000,00 por operação'],
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED_ADMIN]: ['Máximo: R$ 1.000.000,00'],
  [ErrorCodes.WEEKLY_LIMIT_EXCEEDED]: ['Aguarde a próxima semana'],
  [ErrorCodes.DAILY_WITHDRAWAL_LIMIT_EXCEEDED]: ['Limite diário: R$ 1.000,00'],
  [ErrorCodes.MINIMUM_ACCOUNT_AGE]: ['Aguarde 24 horas após o cadastro'],
  [ErrorCodes.BACKUP_FAILED]: ['Tente novamente ou contate o suporte'],
  [ErrorCodes.RESTORE_FAILED]: ['Tente novamente ou contate o suporte'],
} as const;

// Mapeamento de códigos HTTP -> ErrorCode (para HttpsError)
const HTTP_CODE_TO_ERROR_CODE: Record<string, ErrorCode> = {
  'unauthenticated': ErrorCodes.AUTH_REQUIRED,
  'permission-denied': ErrorCodes.PERMISSION_DENIED,
  'not-found': ErrorCodes.USER_NOT_FOUND,
  'already-exists': ErrorCodes.ALREADY_EXISTS,
  'invalid-argument': ErrorCodes.INVALID_VALUE,
  'failed-precondition': ErrorCodes.INVALID_VALUE,
  'internal': ErrorCodes.SERVER_ERROR,
  'unavailable': ErrorCodes.SERVICE_UNAVAILABLE,
  'deadline-exceeded': ErrorCodes.SERVICE_UNAVAILABLE,
};

/**
 * Converte HttpsError do backend para ErrorCode padronizado
 */
export function httpsErrorToErrorCode(error: { code?: string; message?: string }): ErrorCode {
  if (error.code && HTTP_CODE_TO_ERROR_CODE[error.code]) {
    return HTTP_CODE_TO_ERROR_CODE[error.code];
  }
  // Fallback por mensagem (ordem importa: mais específico primeiro)
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('cpf')) return ErrorCodes.INVALID_CPF;
  if (msg.includes('senha mestra') || msg.includes('master password') || msg.includes('master')) return ErrorCodes.MASTER_PASSWORD_INCORRECT;
  if (msg.includes('senha')) return ErrorCodes.PASSWORD_INCORRECT;
  if (msg.includes('comprovante') || msg.includes('proof')) return ErrorCodes.DUPLICATE_PROOF;
  if (msg.includes('estoque') || msg.includes('stock')) return ErrorCodes.INSUFFICIENT_STOCK;
  if (msg.includes('saldo') || msg.includes('balance')) return ErrorCodes.INSUFFICIENT_BALANCE;
  if (msg.includes('crédito') || msg.includes('credit')) return ErrorCodes.INSUFFICIENT_CREDIT;
  if (msg.includes('perm')) return ErrorCodes.PERMISSION_DENIED;
  if (msg.includes('rede') || msg.includes('conex') || msg.includes('network')) return ErrorCodes.NETWORK_ERROR;
  return ErrorCodes.SERVER_ERROR;
}

/**
 * Retorna mensagem amigável para o usuário
 */
export function getUserMessage(code: ErrorCode, params?: Record<string, string | number>): string {
  let msg = USER_MESSAGES[code] || 'Ocorreu um erro inesperado. Tente novamente.';
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    });
  }
  return msg;
}

/**
 * Retorna mensagem técnica para logs
 */
export function getTechMessage(code: ErrorCode): string {
  return TECH_MESSAGES[code] || 'Unknown error';
}

/**
 * Retorna ações sugeridas
 */
export function getSuggestedActions(code: ErrorCode): string[] {
  return SUGGESTED_ACTIONS[code] || ['Tente novamente', 'Contate o suporte se persistir'];
}

/**
 * Cria objeto de erro padronizado para o frontend
 */
export interface StandardError {
  code: ErrorCode;
  userMessage: string;
  techMessage: string;
  actions: string[];
  params?: Record<string, string | number>;
}

export function createStandardError(code: ErrorCode, params?: Record<string, string | number>): StandardError {
  return {
    code,
    userMessage: getUserMessage(code, params),
    techMessage: getTechMessage(code),
    actions: getSuggestedActions(code),
    params,
  };
}

/**
 * Converte Error genérico do frontend para StandardError
 */
export function errorToStandardError(error: unknown): StandardError {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = httpsErrorToErrorCode(error as { code?: string; message?: string });
    return createStandardError(code);
  }
  if (error instanceof Error) {
    return createStandardError(ErrorCodes.SERVER_ERROR);
  }
  return createStandardError(ErrorCodes.SERVER_ERROR);
}

/**
 * Hook React para mostrar erros padronizados via showNotification
 */
export function useErrorHandler() {
  // Deve ser implementado no contexto React
  // export const useErrorHandler = () => {
  //   const { showNotification } = useApp();
  //   return (error: unknown) => {
  //     const std = errorToStandardError(error);
  //     showNotification(std.userMessage, 'error');
  //     return std;
  //   };
  // };
}