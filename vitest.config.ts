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
    // A suíte de UI renderiza o PDV inteiro (componente pesado) em vários
    // arquivos. Com o padrão de 5s, em máquina carregada o teste estourava o
    // tempo mesmo com o comportamento correto — o que gerava falha
    // intermitente. 15s dá folga para o render sem mascarar erro real (a
    // asserção continua obrigando o resultado).
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
