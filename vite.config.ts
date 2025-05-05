import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [svelte({
    compilerOptions: {
      warningFilter: (warning) => {
        if (warning.code.startsWith('a11y')) {
          return true;
        } // filter out all a11y warnings
        return false
      }
    },
    onwarn(warning, handler) {
      // filter out all a11y warnings
      if (warning.code.startsWith('a11y')) {
        return;
      }
      handler(warning);
    }
  })],
})
