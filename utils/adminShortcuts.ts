/**
 * MAPA DE ATALHOS DO PAINEL ADMIN (F1–F12 e '?').
 *
 * Extraído do AdminDashboard para ficar testável: antes, a tabela de teclas
 * vivia dentro de um handler de keydown não exportado, sem nenhuma cobertura.
 * Erros de mapeamento (ex.: F6 abrindo a tela errada) passavam batido.
 *
 * Este módulo é PURO — recebe as ações por injeção e devolve o mapa de teclas.
 */

export interface AtalhosDeps {
  /** Navegação central com checagem de permissão (goToTab do dashboard). */
  irPara: (tab: string) => void;
  /** Vai para o painel inicial (F1) sem passar por goToTab. */
  irParaInicio: () => void;
  /** Consulta de permissão do usuário (hasPermission). */
  permissao: (perm: string) => boolean;
  /** Abre o modal de venda direta (PDV). */
  abrirVenda: () => void;
  /** Feedback ao operador (showNotification). */
  notificar: (mensagem: string, tipo: 'error') => void;
}

/** Regex EXATA de F1–F12 — evita falso positivo para a tecla 'F' sozinha. */
export const REGEX_TECLA_FUNCAO = /^F([1-9]|1[0-2])$/;

/** A tecla dispara algum atalho global? */
export function ehTeclaDeAtalho(tecla: string): boolean {
  return REGEX_TECLA_FUNCAO.test(tecla) || tecla === '?';
}

/** Constrói o mapa tecla → ação. A tecla '?' é tratada pelo chamador. */
export function construirMapaAtalhos(d: AtalhosDeps): Record<string, () => void> {
  return {
    F1: () => d.irParaInicio(),
    F2: () => {
      if (d.permissao('sales')) d.abrirVenda();
      else d.notificar('Permissão negada para Venda Direta (PDV).', 'error');
    },
    F3: () => d.irPara('orders'),
    F4: () => d.irPara('reports'),
    F5: () => d.irPara('products'),
    F6: () => d.irPara('finance'),
    F7: () => d.irPara('wallet'),
    F8: () => d.irPara('users'),
    F9: () => d.irPara('bi'),
    F10: () => d.irPara('settings'),
    F11: () => d.irPara('cash'),
    F12: () => d.irPara('customers'),
  };
}
