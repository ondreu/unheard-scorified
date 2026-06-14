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
        // TODO(M0): doplnit reálné ikony 192/512 do static/ pro plnou instalovatelnost.
        icons: [],
      },
    }),
  ] as PluginOption[],
  server: {
    // V dev proxy na API, ať frontend volá /api/* bez CORS.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
