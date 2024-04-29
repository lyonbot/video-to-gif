import childProcess from 'node:child_process';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import devtools from 'solid-devtools/vite';
import UnoCSS from 'unocss/vite';

let GIT_REVISION = 'unknown'
try { GIT_REVISION = childProcess.execSync("git rev-parse HEAD").toString().trim() } catch { }

export default defineConfig({
  plugins: [
    UnoCSS(),
    /* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    devtools(),
    solidPlugin(),
  ],
  server: {
    port: 3000,
  },
  base: './',
  build: {
    target: 'esnext',
  },
  define: {
    GIT_REVISION: JSON.stringify(GIT_REVISION)
  }
});
