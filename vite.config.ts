import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte({
    compilerOptions: {
      warningFilter: (warning) => {
        if (warning.code === "a11y-click-events-have-key-events") return true;
        if (warning.code === "a11y_click_events_have_key_events") return true;
        if (warning.code === "a11y-no-static-element-interactions") return true;
        if (warning.code === "a11y_no_static_element_interactions") return true;
        // Otherwise, let Svelte handle it
        return false
      }
    }
  })],
})
