import { store } from "../store";

self.onmessage = (event) => {
  const { file, options, outputSize: { width, height } } = event.data as { file: File; options: typeof store['options'], outputSize: { width: number, height: number } }
  
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');


  
}
self.postMessage('ready')