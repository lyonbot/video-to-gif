import childProcess from 'node:child_process';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import devtools from 'solid-devtools/vite';
import UnoCSS from 'unocss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { readFileSync } from 'node:fs';

let GIT_REVISION = 'unknown'
try { GIT_REVISION = childProcess.execSync("git rev-parse HEAD").toString().trim() } catch { }

const ffmpegCoreVersion = JSON.parse(readFileSync('node_modules/@ffmpeg/core/package.json', 'utf-8')).version;

export default defineConfig({
  plugins: [
    UnoCSS(),
    /*
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    devtools(),
    solidPlugin(),
    viteStaticCopy({
      targets: [
        { src: './LICENSE', dest: './' },
        { src: './README.md', dest: './' },
        { src: './node_modules/@ffmpeg/core/dist/esm', dest: './ffmpeg-core' },
      ]
    })
  ],
  server: {
    port: 3000,
  },
  base: './',
  build: {
    target: 'esnext',
  },
  define: {
    FFMPEG_CORE_VERSION: JSON.stringify(ffmpegCoreVersion),
    GIT_REVISION: JSON.stringify(GIT_REVISION)
  }
});
