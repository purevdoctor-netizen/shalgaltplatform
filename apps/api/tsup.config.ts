import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    lan: 'src/lan.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  // @shalgalt/shared нь эмхэтгээгүй TypeScript эх код тул багцад шингээж оруулна.
  noExternal: ['@shalgalt/shared'],
  // Prisma-ийн үүсгэсэн клиент болон native binding-ийг багцлахгүй.
  external: ['@prisma/client', '.prisma/client'],
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});
