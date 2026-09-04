import type { User } from '../types';

/**
 * Busca de clientes do PDV — extraída do AdminSalesModalDefault para ser
 * testável e usada de forma consistente.
 *
 * Regra de ouro: SEM busca digitada, a lista permanece VAZIA. Os nomes dos
 * consumidores só aparecem depois que o operador digita nome, CPF ou nome do
 * interno — nada do cadastro "vaza" antes do filtro.
 *
 * Busca por dígitos (CPF/telefone) usa prefixo; busca por texto usa "contém"
 * case-insensitive em nome, nome do interno, e-mail e CPFs.
 *
 * @param lista lista completa de clientes (inclui o consumidor sintético)
 * @param termo texto digitado pelo operador
 * @param max limite de resultados (padrão 30)
 */
export function filtrarClientesPdv(lista: User[], termo: string, max = 30): User[] {
  const term = (termo || '').trim();
  if (!term) return [];

  const termoLower = term.toLowerCase();
  const numeros = termoLower.replace(/\D/g, '');

  const resultados = lista.filter(u => {
    const nome = (u.name || '').toLowerCase();
    const nomeInterno = (u.inmateName || u.prisonerName || '').toLowerCase();
    const cpfFamiliar = (u.cpf || '').replace(/\D/g, '');
    const cpfInterno = (u.inmateCpf || u.prisonerCpf || '').replace(/\D/g, '');
    const email = (u.email || '').toLowerCase();
    const telefone = (u.phone || '').replace(/\D/g, '');

    if (/^\d+$/.test(termoLower)) {
      return cpfFamiliar.startsWith(numeros) || cpfInterno.startsWith(numeros) || (telefone && telefone.startsWith(numeros));
    }
    return (
      nome.includes(termoLower) ||
      nomeInterno.includes(termoLower) ||
      email.includes(termoLower) ||
      (numeros && cpfFamiliar.includes(numeros)) ||
      (numeros && cpfInterno.includes(numeros))
    );
  });

  return resultados
    .sort((a, b) => {
      const aNome = (a.name || '').toLowerCase();
      const bNome = (b.name || '').toLowerCase();
      const aStart = aNome.startsWith(termoLower) ? 0 : 1;
      const bStart = bNome.startsWith(termoLower) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return aNome.localeCompare(bNome);
    })
    .slice(0, max);
}