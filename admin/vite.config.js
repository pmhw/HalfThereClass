import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // 相对路径：可挂在任意 /{ADMIN_ENTRY}/ 下。
  // 注意：深层路由刷新需后端注入 <base href="/{ENTRY}/">（见 backend/src/main.ts sendAdminIndex）
  base: './',
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
