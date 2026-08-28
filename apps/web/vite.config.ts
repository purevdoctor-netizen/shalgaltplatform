import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // `.env` нь монорепогийн үндэс дээр байна (ASSUMPTIONS A-10)
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const env = loadEnv(mode, repoRoot, 'VITE_');

  return {
    envDir: repoRoot,

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shalgalt/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },

    server: {
      port: 5173,
      host: true,
      proxy: {
        // VITE_API_BASE_URL хоосон үед клиент ижил origin руу ханддаг
        '/api': {
          target: `http://localhost:${process.env.API_PORT ?? 3000}`,
          changeOrigin: true,
        },
      },
    },

    preview: { port: 4173, host: true },

    build: {
      target: 'es2020',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            // Зөвхөн тайлангийн хуудсанд хэрэгтэй хүнд сангуудыг тусгаарлана
            docx: ['docx', 'html-to-image'],
            charts: ['recharts'],
            qr: ['qrcode', 'html5-qrcode'],
            xlsx: ['xlsx'],
          },
        },
      },
    },

    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'icons/icon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: env.VITE_APP_NAME || 'Шалгалтын платформ',
          short_name: 'Шалгалт',
          description:
            'Сурагчийн өмнөх/дараах мэдлэгийн үнэлгээ — QR кодоор, интернэтгүй ч ажиллана',
          lang: 'mn',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#ffffff',
          theme_color: '#4f46e5',
          categories: ['education', 'productivity'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Апп бүрэн офлайн ажиллах ёстой тул БҮХ асетыг precache хийнэ
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,json}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // API — NetworkFirst, 3 сек timeout (даалгаврын шаардлага)
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'shalgalt-api',
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
  };
});
