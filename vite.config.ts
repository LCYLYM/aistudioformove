import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  // 使用相对路径，保证在 Electron 中通过 file:// 打开 dist/index.html 时
  // 能正确加载 ./assets/... 脚本，而不是指向磁盘根目录
  base: './',
  build: {
    outDir: 'dist',
  },
});
