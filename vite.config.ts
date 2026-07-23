import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vendor libs change rarely — split them so app edits don't bust
        // the whole bundle cache. Function form: Vite 8 (rolldown) dropped
        // the object shorthand.
        manualChunks(id: string) {
          if (id.includes('node_modules/react')) return 'react';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          return undefined;
        },
      },
    },
  },
});
