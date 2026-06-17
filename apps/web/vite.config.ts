import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig, type PluginOption } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      // injectManifest = vlastní service worker (src/service-worker.ts)
      // s precache manifestem injektovaným pluginem — nutné pro push event handlery.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'AFK to 60',
        short_name: 'AFK to 60',
        description: 'WoW-inspired idle RPG — AFK to 60',
        theme_color: '#1a1410',
        background_color: '#1a1410',
        display: 'standalone',
        // Procedurální pixel-art ikony (generované scripts/generate-pwa-icons.mjs).
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ] as PluginOption[],
  server: {
    // V dev proxy na API, ať frontend volá /api/* bez CORS.
    // `ws: true` → proxy i WebSocket upgrade (Areny, M7) přes /api/socket.io.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
