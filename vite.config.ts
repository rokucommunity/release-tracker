import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const codes = [
  'a11y_click_events_have_key_events',
  'a11y_no_static_element_interactions',
  'a11y_no_noninteractive_element_interactions',
  'a11y_consider_explicit_label'
].flatMap(code => [
  code,
  code.replace(/_/g, '-')
]);

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte({
    compilerOptions: {
      warningFilter: (warning) => {
        if (codes.includes(warning.code)) return true;
        return false
      }
    }
  })],
})
