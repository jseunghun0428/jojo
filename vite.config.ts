import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, isPreview }) => ({
  publicDir: command === 'serve' && !isPreview ? 'local-graphics' : false,
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
    chunkSizeWarningLimit: 1500,
  },
}))
