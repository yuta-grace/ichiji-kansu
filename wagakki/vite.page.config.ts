// claude.ai の非公開ページ用のビルド（React は cdnjs から読み込み、残りは1つの HTML に入れる）
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  define: { 'import.meta.env.VITE_CLAUDE_PAGE': JSON.stringify('1') },
  // 五線譜・PDF の部品は同梱しない（使うときに CDN から読み込む）
  resolve: {
    alias: {
      vexflow: '/src/shims/empty.ts',
      jspdf: '/src/shims/empty.ts',
      html2canvas: '/src/shims/empty.ts',
    },
  },
  build: {
    outDir: 'dist-page',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.tsx',
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
});
