import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Detekce nového nasazení: SvelteKit periodicky stahuje `version.json` a
    // při změně verze nastaví `updated` store → appka vyzve k reloadu
    // (UpdateBanner). `name` je build-time timestamp (mění se každým buildem).
    version: {
      name: globalThis.process?.env?.PUBLIC_BUILD_ID ?? Date.now().toString(),
      pollInterval: 60_000,
    },
  },
};

export default config;
