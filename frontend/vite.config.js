import { defineConfig } from 'vite';

export default defineConfig({
  // During `npm run dev`, proxy all /api/* requests to the local backend
  // so the frontend can use relative paths everywhere (nginx handles it in prod)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
