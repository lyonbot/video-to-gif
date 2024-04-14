import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { updateStore } from "./store";
import workerURL from '@ffmpeg/ffmpeg/worker?url';

export async function initFFmpeg() {
  let ffmpeg = new FFmpeg()
  const CORE_VERSION = '0.12.6'
  const baseURL = 'https://unpkg.com/@ffmpeg/core@' + CORE_VERSION + '/dist/esm'

  // Load the WASM file and coreURL
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  ])

  await ffmpeg.load({
    coreURL,
    wasmURL,
    classWorkerURL: import.meta.env.PROD ? undefined : workerURL, // vite bug
  });

  updateStore({ ffmpeg })
}
