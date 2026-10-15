import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves from /<repo>/; set by the deploy workflow
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
});
