import { MP4ArrayBuffer } from "mp4box"

export interface VideoFileInfo {
  width: number,
  height: number,
  duration: number,
}

export async function readVideoFileInfo({ fileContent, fileURL }: { fileContent: ArrayBufferLike, fileURL: string }) {
  const outInfo = await new Promise<VideoFileInfo>(resolve => {
    const video = document.createElement('video');
    setTimeout(() => resolve({
      width: 0,
      height: 0,
      duration: 0,
    }), 1200)

    video.onloadedmetadata = () => resolve({
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    })
    video.src = fileURL;
    video.muted = true;
  })

  if (!(outInfo.width && outInfo.height && outInfo.duration)) {
    // use mp4box to get info of malformed mp4 file (eg. mpeg4 is not supported by chrome )

    const MP4Box = await import('mp4box')
    const mp4boxInputFile = MP4Box.createFile();
    const info = await new Promise<any>((resolve, reject) => {
      const buffer = new Uint8Array(fileContent).buffer.slice(0) as MP4ArrayBuffer
      buffer.fileStart = 0

      mp4boxInputFile.onReady = resolve
      mp4boxInputFile.onError = reject
      mp4boxInputFile.appendBuffer(buffer)
    })

    const track = info.videoTracks[0] || info.otherTracks.find((x: any) => /video/i.test(x.name));
    if (track) {
      if (!outInfo.width || !outInfo.height) {
        const [a, c, e, b, d, f] = Array.from(track.matrix.slice(0, 6), (x: number) => x / 65536) // Fixed-float number
        outInfo.width = Math.abs(a * track.track_width + c * track.track_height)
        outInfo.height = Math.abs(b * track.track_width + d * track.track_height)
      }
    }

    if (!outInfo.duration) {
      outInfo.duration = info.duration / 1000 // seconds
    }
  }

  return outInfo
}
