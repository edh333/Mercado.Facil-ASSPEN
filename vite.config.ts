import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const timestamp = new Date().getTime();
  return {
    server: {
      port: 5177,
      host: '0.0.0.0',
      hmr: {
        clientPort: 5177,
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      // Limpe os modulepreload que o Vite injeta em TODAS as pages para vendors
      // que NÃO são usadas naquele entry:
      //  - /print.html não usa recharts nem framer-motion (impressão 100% limpa);
      //  - /index.html passou a carregar recharts sob demanda (utils/rechartsLoader)
      //    — o admin baixa o gráfico ao abrir o Dashboard, familiares nunca.
      // Remover o link ~545 kB/vendor-charts poupa download em todos os acessos.
      {
        name: 'strip-unused-preloads',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(html: string, ctx: any) {
            const page = String(ctx?.path || '');
            if (/\bprint\.html$/i.test(page)) {
              return html.replace(/<link rel="modulepreload"[^>]+href="[^"]*vendor-(charts|motion)-[^"]*"[^>]*>\s*/g, '');
            }
            if (/\bindex\.html$/i.test(page)) {
              return html.replace(/<link rel="modulepreload"[^>]+href="[^"]*vendor-charts-[^"]*"[^>]*>\s*/g, '');
            }
            return html;
          },
        },
      },
    ],
    build: {
      target: 'esnext',
      outDir: 'build',
      sourcemap: false,
      minify: 'esbuild',
      cssMinify: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          print: path.resolve(__dirname, 'print.html'),
        },
        output: {
          entryFileNames: 'assets/index-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          // ⚠ FORMA DE FUNÇÃO, não de objeto.
          // A forma de objeto (`{ 'vendor-x': ['lib'] }`) manda o Rollup incluir
          // as DEPENDÊNCIAS de cada lib dentro do chunk dela. Como lucide-react,
          // framer-motion e recharts TODAS dependem de react/react-dom, o
          // resultado era o runtime do React COPIADO para dentro de cada chunk
          // vendor — 3+ cópias do React na mesma página. Hooks usavam o
          // dispatcher de uma cópia e o renderer de outra →
          // "Minified React error #321: Invalid hook call".
          // Na forma de função cada módulo cai em UM chunk só (decisão por id),
          // então o React fica único em vendor-react e compartilhado por todos.
          // O runtime do React precisa ser carregado ANTES de qualquer
          // componente: mantemos o nome vendor-react (o strip-unused-preloads
          // acima e o preload do index.html dependem desse prefixo).
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            const pkg = id.split('node_modules').pop()!.split(/[\\/]/).filter(Boolean);
            const root = pkg[0]?.startsWith('@') ? `${pkg[0]}/${pkg[1]}` : pkg[0];
            // React primeiro: qualquer coisa que dependa dele precisa da MESMA
            // instância (hooks + renderer compartilham o dispatcher).
            if (/^(react|react-dom|react-is|scheduler|react-reconciler)$/.test(root)) return 'vendor-react';
            if (root === 'firebase' || root === '@firebase') return 'vendor-firebase';
            if (root === 'lucide-react') return 'vendor-icons';
            if (root === 'framer-motion' || root === 'motion-dom' || root === 'motion-utils') return 'vendor-motion';
            if (root === 'qrcode.react' || root === 'qrcode') return 'vendor-qr';
            if (
              root === 'recharts' || root === '@reduxjs' || root === 'react-redux' ||
              root === 'redux' || root === 'redux-thunk' || root === 'use-sync-external-store' ||
              root === 'reselect' || root === 'victory-vendor' || root === 'victory-core' ||
              root === 'react-smooth' || root === 'tiny-invariant' || root === 'decimal.js-light' ||
              root === 'fast-equals' || root === 'es-toolkit' || root === 'react-is'
            ) return 'vendor-charts';
            // Demais libs: deixa o chunking padrão do Rollup decidir (ele só
            // cria chunk compartilhado para o que é usado por 2+ entradas), em
            // vez de um catch-all 'vendor' que inflaria o print.html.
            return undefined;
          }
        }
      }
    },
    worker: {
      format: 'es',
      plugins: () => [react()]
    },
    optimizeDeps: {
       include: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react']
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
