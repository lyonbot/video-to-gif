import { FFmpeg } from "@ffmpeg/ffmpeg";
import { updateStore } from "./store";
import workerURL from '@ffmpeg/ffmpeg/worker?url';

export async function initFFmpeg() {
  let ffmpeg = new FFmpeg()

  await ffmpeg.load({
    coreURL: './ffmpeg-core.js',
    wasmURL: './ffmpeg-core.wasm',
    classWorkerURL: import.meta.env.PROD ? undefined : workerURL, // vite bug
  });

  updateStore({ ffmpeg })
}
