import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Setting the base path to an empty string.
  // This is required for serving a single-page app from the backend.
  base: ''
});
