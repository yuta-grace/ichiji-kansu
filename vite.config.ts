import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相対パスにして、どこに置いても静的ファイルとして開けるようにする
  base: './',
});
