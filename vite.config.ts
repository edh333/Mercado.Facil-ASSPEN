import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
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
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
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
          manualChunks: {
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
            'vendor-charts': ['recharts'],
            'vendor-motion': ['framer-motion'],
            'vendor-qr': ['qrcode.react'],
            'vendor-icons': ['lucide-react'],
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
