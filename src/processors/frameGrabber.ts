import { MP4ArrayBuffer } from 'mp4box';
import { makePromise, noop } from 'yon-utils';
import { reportError } from '../report';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

interface GrabFrameOptions {
  file: File;
  resizeWidth: number;
  resizeHeight: number;
  frameTimestamps: number[]; // in sec

  reportProgress: (grabbedCount: number, newestFrame: GrabbedFrame) => boolean; // return false to stop grabbing
  ffmpeg?: FFmpeg | null
}

interface GrabbedFrame {
  image: CanvasImageSource;
  time: number;
}

export async function grabFramesWithMP4Box({ file, resizeWidth, resizeHeight, frameTimestamps, reportProgress }: GrabFrameOptions) {
  const startTS = frameTimestamps[0] * 1000000
  const endTS = frameTimestamps[frameTimestamps.length - 1] * 1000000
  const outputFrames = [] as GrabbedFrame[]
  const finishedPromise = makePromise<void>()
  let stopped = false

  const canvas = document.createElement('canvas')
  canvas.width = resizeWidth
  canvas.height = resizeHeight
  const ctx = canvas.getContext('2d')!
  let transform: DOMMatrix

  const MP4Box = await import('mp4box')
  const DataStream = MP4Box.DataStream;
  const mp4boxInputFile = MP4Box.createFile();

  mp4boxInputFile.onError = error => {
    reportError('MP4Box Error', error)
    finishedPromise.reject(error)
  };

  const mp4InfoPromise = new Promise<any>((resolve, reject) => {
    mp4boxInputFile.onReady = resolve
    file.arrayBuffer().then((b) => {
      const buffer = b as MP4ArrayBuffer
      buffer.fileStart = 0
      mp4boxInputFile.appendBuffer(buffer)
    }).catch(reject)
  });

  // reference: https://github.com/vjeux/mp4-h264-re-encode/tree/main
  const decoder = new VideoDecoder({
    async output(inputFrame) {
      // use "while" to duplicate frame, if necessary
      while (
        !stopped &&
        outputFrames.length < frameTimestamps.length &&
        inputFrame.timestamp >= frameTimestamps[outputFrames.length] * 1e6
      ) {
        ctx.resetTransform()
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        ctx.setTransform(transform)
        ctx.drawImage(inputFrame, 0, 0)

        // FIXME: canvas will be invalidated soon
        // this heavily depends on "reportProgress" to consume the frame
        outputFrames.push({ image: canvas, time: inputFrame.timestamp / 1e6 });

        if (!reportProgress(outputFrames.length, outputFrames.at(-1)!)) {
          stopped = true;
          finishedPromise.resolve();
        }
      }

      if (outputFrames.length >= frameTimestamps.length) {
        finishedPromise.resolve();
      }

      inputFrame.close();
    },
    error(error) {
      reportError('Decoder Error', error);
      finishedPromise.reject(error)
    },
  });

  // get video stream descriptor and give to decoder
  const info = await mp4InfoPromise;
  const track = info.videoTracks[0] || info.otherTracks.find((x: any) => /video/i.test(x.name));
  {
    let description: Uint8Array | undefined;
    const trak = mp4boxInputFile.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      if (entry.avcC || entry.hvcC) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        if (entry.avcC) entry.avcC.write(stream);
        else entry.hvcC.write(stream);

        description = new Uint8Array(stream.buffer, 8); // Remove the box header.
        break;
      }
      if (entry.type === 'mp4v') {
        description = entry.data;
        break;
      }
    }

    if (!description) throw new Error('no video description')

    // for mobile phone recording, content shall be rotated by "matrix"
    if (track.matrix.slice(0, 6).join(',') !== '65536,0,0,0,65536,0') {
      // video need to be rotated
      // see https://www.w3resource.com/html5-canvas/html5-canvas-matrix-transforms.php
      const [a, c, e, b, d, f] = Array.from(track.matrix.slice(0, 6), (x: number) => x / 65536) // Fixed-float number
      const matrix = new DOMMatrix([a, b, c, d, e, f])

      console.log('video transform matrix', [a, c, e, b, d, f])

      const scaleX = resizeWidth / Math.abs(a * track.track_width + c * track.track_height)
      const scaleY = resizeHeight / Math.abs(b * track.track_width + d * track.track_height)
      // Note: transform order is reversed (translate first, then apply matrix, then scale, then translate back)
      transform = new DOMMatrix()
        .translate(resizeWidth / 2, resizeHeight / 2)
        .scale(scaleX, scaleY)
        .multiply(matrix.inverse())
        .translate(-track.track_width / 2, -track.track_height / 2)
    } else {
      // just regular scaling
      const scaleX = resizeWidth / track.track_width
      const scaleY = resizeHeight / track.track_height
      transform = new DOMMatrix([scaleX, 0, 0, scaleY, 0, 0])
    }

    // configure decoder
    decoder.configure({
      codec: track.codec,
      codedWidth: track.track_width,
      codedHeight: track.track_height,
      hardwareAcceleration: 'prefer-hardware',
      description,
    });
  }

  // start extracting packages and decoding
  mp4boxInputFile.onSamples = async (track_id: any, ref: any, samples: any[]) => {
    let i = 0;
    while (i < samples.length && ((samples[i].cts + samples[i].duration) * 1e6 / samples[i].timescale < startTS)) i++;
    while (i > 0 && !samples[i].is_sync) i--;

    let waitingForEndKeyFrame = false;

    for (; i < samples.length; i++) {
      const sample = samples[i];
      const timestamp = sample.cts * 1000000 / sample.timescale;

      if (stopped) break;

      decoder.decode(new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: timestamp,
        duration: sample.duration * 1_000_000 / sample.timescale,
        data: sample.data
      }));

      if (timestamp > endTS) waitingForEndKeyFrame = true;
      if (waitingForEndKeyFrame && sample.is_sync) break;
    }

    await decoder.flush();
    decoder.close();

    finishedPromise.resolve(); // TODO: somehow not all frame are grabbed, but the progress not exit in Decoder
  };
  mp4boxInputFile.setExtractionOptions(track.id, null, { nbSamples: Infinity });
  mp4boxInputFile.start();

  await finishedPromise
  return outputFrames
}

export async function grabFramesWithVideoTag({ file, resizeWidth, resizeHeight, frameTimestamps, reportProgress }: GrabFrameOptions) {
  const fileURL = URL.createObjectURL(file)
  const start = frameTimestamps[0]
  const outputFrames = [] as GrabbedFrame[]

  try {
    const video = document.createElement('video')
    const videoReady = new Promise(r => video.onloadedmetadata = r)
    video.muted = true
    video.src = fileURL

    await videoReady
    const videoPlaying = new Promise(r => video.onplaying = r)
    video.currentTime = start
    video.play()
    await videoPlaying
    video.pause()
    video.currentTime = start
    video.onplaying = null

    // grab frames

    const waitForFrameReady = () => new Promise(r => video.onseeked = r)
    for (let i = 0; i < frameTimestamps.length; i++) {
      const frameTime = frameTimestamps[i]
      const seekEnd = waitForFrameReady()
      video.currentTime = frameTime
      await seekEnd

      outputFrames.push({
        image: await createImageBitmap(video, { resizeWidth, resizeHeight }),
        time: frameTime
      })
      if (!reportProgress(i + 1, outputFrames.at(-1)!)) break
    }

    return outputFrames
  } finally {
    URL.revokeObjectURL(fileURL)
  }
}

export async function grabFramesWithFFMpeg({ file, resizeWidth, resizeHeight, frameTimestamps, reportProgress, ffmpeg }: GrabFrameOptions) {
  if (!ffmpeg) throw new Error('FFMpeg not loaded');

  const start = frameTimestamps[0]
  const end = frameTimestamps[frameTimestamps.length - 1]
  const fps = frameTimestamps.length / (end - start) // TODO: rewrite this with ffmpeg "select" filter

  // const mountPoint = "/mounted/"
  // await ffmpeg.mount('WORKERFS' as any, { files: [file] }, mountPoint) // see https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs
  const inputFileName = 'input__' + file.name
  await ffmpeg.writeFile(inputFileName, new Uint8Array(await file.arrayBuffer()))

  const abortController = new AbortController()
  let aborted = false

  const outputFrames = [] as GrabbedFrame[]

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = resizeWidth
  tempCanvas.height = resizeHeight
  const tempCtx = tempCanvas.getContext('2d')!

  const poll = async () => {
    while (!aborted) {
      const frameFilename = `out${outputFrames.length + 1}.rgba`;
      const data = await ffmpeg.readFile(frameFilename).catch(noop)
      if (!data?.length) break;

      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height)
      tempCtx.putImageData(new ImageData(new Uint8ClampedArray(data.slice() as Uint8Array), resizeWidth, resizeHeight), 0, 0)
      await ffmpeg.deleteFile(`out${outputFrames.length}.rgba`).catch(noop)
      outputFrames.push({
        image: tempCanvas,
        time: frameTimestamps[outputFrames.length]
      })

      aborted = reportProgress(outputFrames.length, outputFrames.at(-1)!)
      if (aborted) abortController.abort()
    }
  }

  try {
    const vf: string[] = [
      'scale=' + resizeWidth + ':' + resizeHeight
    ]

    ffmpeg.on('progress', poll)
    await ffmpeg.exec([
      '-i', inputFileName, //mountPoint + file.name,
      '-ss', String(start),
      '-r', String(fps),
      '-vframes', String(frameTimestamps.length),
      ...vf.length ? ['-vf', vf.join(',')] : [],
      '-c:v', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-f', 'image2',
      'out%d.rgba'
    ], undefined, { signal: abortController.signal })
    await poll()
    await ffmpeg.deleteFile(`out${outputFrames.length}.rgba`).catch(noop)

  } finally {
    ffmpeg.off('progress', poll)
    ffmpeg.deleteFile(inputFileName).catch(noop)
    // await ffmpeg.unmount(mountPoint)
  }

  return outputFrames
}

export async function grabFrames(options: GrabFrameOptions) {
  let error: any;
  let answer = await
    grabFramesWithMP4Box(options)
      .catch(err => {
        reportError('grabFramesWithMP4Box error', err);
        if (confirm('MP4Box+WebCodec cannot decode this file. Try with video tag?')) return grabFramesWithVideoTag(options);
        else error = err;
      })
      .catch(err => {
        reportError('grabFramesWithVideoTag error', err);
        /* if (confirm('HTMLVideoElement cannot decode this file. Try with ffmpeg.wasm decoding?')) */return grabFramesWithFFMpeg(options);
        // else error = err;
      })
      .catch(err => {
        reportError('grabFramesWithFFMpeg error', err);
        alert('Cannot decode this file');
        error = err;
      })


  if (error) throw error;
  return answer
}
