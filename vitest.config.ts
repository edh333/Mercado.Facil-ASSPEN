import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 'node' por padrão: a maioria dos testes são de lógica pura (baratos).
    // Os de componente declaram `// @vitest-environment jsdom` no próprio
    // arquivo, então não custa DOM para quem não precisa.
    environment: 'node',
    // .tsx entra para os testes de RENDERIZAÇÃO de componente (tela de
    // pós-venda do PDV). Antes o projeto não tinha cobertura de UI alguma.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    reporters: ['default'],
  },
});
