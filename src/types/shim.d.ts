declare class ImageCapture {
  constructor(videoTrack: MediaStreamTrack);
  track: MediaStreamTrack
  grabFrame(): Promise<ImageBitmap>
}

declare const GIT_REVISION: string;
