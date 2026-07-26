import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Uploaded media (photos/banners/AR videos) get an absolute URL built
    // from PUBLIC_BASE_URL, which points at this dev server's own origin
    // (matching how one shared domain works in production) -- but the
    // files themselves are only ever served by the backend's /uploads
    // static route on :4000. Proxy them through so those URLs actually
    // resolve locally instead of 404ing against Vite.
    proxy: {
      '/uploads': 'http://localhost:4000',
    },
  },
});
