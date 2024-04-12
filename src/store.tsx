import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { createEffect, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';

export const defaultOptions = {
  colors: 256,
  start: 0,
  end: 0,
  speed: 1,
  width: -1,
  height: -1,
};

export const [store, updateStore] = createStore({
  file: null as null | File,
  fileInfo: {
    url: '',
    width: 0,
    height: 0,
    duration: 0,
  },
  options: defaultOptions,
  ffmpeg: null as null | FFmpeg,
});

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

    return () => {
      URL.revokeObjectURL(url)
    }
  })

  createEffect(() => {
    const { start, end } = store.options;
    if (start > end) updateStore('options', { start: end, end: start })
  })
})
