import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// The router fetches ./src/views/<page>.html at runtime, so the fragments
// aren't part of the module graph; copy them into the build as-is.
function copyViews() {
  let outDir;
  return {
    name: 'copy-views',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      cpSync(resolve('src/views'), resolve(outDir, 'src/views'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [copyViews()],
});
