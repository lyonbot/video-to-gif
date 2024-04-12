import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { updateStore } from "./store";

export async function initFFmpeg() {
  let ffmpeg = new FFmpeg()
  const CORE_VERSION = '0.12.6'
  const baseURL = 'https://unpkg.com/@ffmpeg/core@' + CORE_VERSION + '/dist/umd'

  // Load the WASM file and coreURL
  const [coreURL, wasmURL,classWorkerURL] = await Promise.all([
    toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    toBlobURL('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js', 'text/javascript')
  ])

  await ffmpeg.load({
    coreURL,
    wasmURL,
    classWorkerURL,
  });

  updateStore({ ffmpeg })
}
