declare class ImageCapture {
  constructor(videoTrack: MediaStreamTrack);
  track: MediaStreamTrack
  grabFrame(): Promise<ImageBitmap>
}