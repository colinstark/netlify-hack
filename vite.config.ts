import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pin the dev port so Netlify Dev's `targetPort` proxy always matches. Without
  // strictPort, a busy 5173 makes Vite drift to 5174 and Netlify falls back to
  // serving the static dist/ build (re-triggering the SPA-redirect MIME error).
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist' },
});
