import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

function elementEntry(): Plugin {
  return {
    name: 'ascii-fx-element-entry',
    closeBundle() {
      writeFileSync(
        resolve('dist/element.js'),
        "import { defineAsciiFx } from './index.js';\ndefineAsciiFx();\nexport { AsciiFxElement, defineAsciiFx } from './index.js';\n",
      );
    },
  };
}

export default defineConfig({
  plugins: [elementEntry()],
  build: {
    lib: {
      entry: resolve('src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    sourcemap: true,
    target: 'es2022',
    minify: 'esbuild',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
