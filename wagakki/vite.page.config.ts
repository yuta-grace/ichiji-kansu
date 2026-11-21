// claude.ai の非公開ページ用のビルド（React は cdnjs から読み込み、残りは1つの HTML に入れる）
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  define: { 'import.meta.env.VITE_CLAUDE_PAGE': JSON.stringify('1') },
  build: {
    outDir: 'dist-page',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.tsx',
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
});
