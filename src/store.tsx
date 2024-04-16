import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { FileData } from '@ffmpeg/ffmpeg/dist/esm/types';
import { createEffect, createMemo, createRoot, on, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { debounce } from 'lodash-es';

export enum watermarkLocation {
  top = 'top',
  bottom = 'bottom',
  above = 'above',
  below = 'below',
}

export enum watermarkTextAlign {
  left = 'left',
  center = 'center',
  right = 'right',
}

export const ditherOptions = [
  'none',
  'sierra2_4a',
  'bayer',
  'floyd_steinberg',
]

export const defaultOptions = {
  start: 0,
  end: 0,
  speed: 1,
  width: -1,
  height: -1,
  framerate: 12,
  maxColors: 255,
  dither: 'sierra2_4a',
  watermarkIndex: -1,
};

const defaultWatermarks = [
  {
    name: 'Default Watermark',
    location: watermarkLocation.bottom,
    backgroundColor: '#000000',
    height: 14,
    font: '12px "Arial"',
    text: 'lyonbot/video-to-gif',
    textColor: '#cccccc',
    textAlign: watermarkTextAlign.center,
  }
];

export type WatermarkConfig = typeof defaultWatermarks[0];
export const getDefaultWatermark = (): WatermarkConfig => ({ ...defaultWatermarks[0]! })

export const [store, updateStore] = createStore({
  file: null as null | File,
  fileInfo: {
    url: '',
    width: 0,
    height: 0,
    duration: 0,
  },
  options: { ...defaultOptions },
  ffmpeg: null as null | FFmpeg,

  outputFileContent: null as null | FileData,
  outputFileURL: '',

  watermarks: defaultWatermarks
});

export const outputSize = createRoot(() => {
  return createMemo(() => {
    const { width: ow, height: oh } = store.fileInfo;
    const { width: nw, height: nh } = store.options;

    let w = nw, h = nh;
    if (nw === -1 && nh === -1) { w = ow; h = oh; }
    else if (nw === -1) { w = ow * (nh / oh); }
    else if (nh === -1) { h = oh * (nw / ow); }

    return { width: Math.floor(w), height: Math.floor(h) }
  })
})

export const outputTimeRange = createRoot(() => {
  return createMemo(() => {
    const { start: sourceStart, end: sourceEnd, speed, framerate } = store.options;

    const duration = (sourceEnd - sourceStart) / speed
    const frameCount = Math.ceil(duration * framerate);

    const outputFramePresentTimeMS = Array.from({ length: frameCount }, (_, i) => Math.round(i / frameCount * duration * 1e3))
    const outputFrameDurationMS = outputFramePresentTimeMS.map((t, i) => (i === frameCount - 1 ? duration : outputFramePresentTimeMS[i + 1]) - t)

    return {
      sourceStart,
      sourceEnd,

      duration,
      frameCount,
      outputFramePresentTimeMS,
      outputFrameDurationMS,
    }
  })
})

createRoot(() => {
  createEffect(() => {
    updateStore('fileInfo', { url: '' })

    const file = store.file;
    if (!file) return

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.onloadedmetadata = () => {
      updateStore('fileInfo', {
        url,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      })
      updateStore('options', { ...defaultOptions, end: video.duration })
    }
    video.src = url;
    video.muted = true;

    onCleanup(() => { URL.revokeObjectURL(url) })
  })

  createEffect(() => {
    const { start, end } = store.options;
    if (start > end) updateStore('options', { start: end, end: start })
  })

  createEffect(() => {
    const { outputFileContent } = store;
    if (!outputFileContent) {
      updateStore('outputFileURL', '')
      return;
    }

    const blob = new Blob([outputFileContent], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    updateStore('outputFileURL', url)

    onCleanup(() => { URL.revokeObjectURL(url) })
  })

  // watermark sync
  const skWatermarks = 'vtg:watermarks'
  const skWatermarkIndex = 'vtg:watermarkIndex'
  updateStore('options', 'watermarkIndex', defaultOptions.watermarkIndex = +(localStorage.getItem(skWatermarkIndex) ?? -1))
  createEffect(() => {
    let idx = store.options.watermarkIndex
    if (idx < -1) idx = -1
    if (idx > store.watermarks.length - 1) idx = store.watermarks.length - 1

    localStorage.setItem(skWatermarkIndex, idx.toString())
    defaultOptions.watermarkIndex = idx
  })
  try { updateStore('watermarks', JSON.parse(localStorage.getItem(skWatermarks) ?? '?')) } catch { }
  createEffect(on(() => JSON.stringify(store.watermarks), debounce(() => localStorage.setItem(skWatermarks, JSON.stringify(store.watermarks)), 1000, { trailing: true })))
})
