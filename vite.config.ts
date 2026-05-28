import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    svelte({
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
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'github-mark-white.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'RokuCommunity Release Tracker',
        short_name: 'Release Tracker',
        description: 'Track the various release statuses of the RokuCommunity projects.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // App shell only: precache the built JS/CSS/HTML/icons. Live GitHub/shields.io
        // calls are intentionally NOT cached so we never serve stale release data.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      },
      devOptions: {
        enabled: false
      }
    })
  ],
})
