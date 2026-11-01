import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // transformers.js ships its own wasm loader; let it load as-is.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
