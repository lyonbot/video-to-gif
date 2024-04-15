import { MP4ArrayBuffer } from 'mp4box';
import { makePromise } from 'yon-utils';
import { reportError } from '../report';

interface GrabFrameOptions {
  file: File;
  resizeWidth: number;
  resizeHeight: number;
  frameTimestamps: number[]; // in sec

  reportProgress: (grabbedCount: number, newestFrame: GrabbedFrame) => boolean; // return false to stop grabbing
}

interface GrabbedFrame {
  bitmap: ImageBitmap;
  time: number;
}

export async function grabFramesWithMP4Box({ file, resizeWidth, resizeHeight, frameTimestamps, reportProgress }: GrabFrameOptions) {
  const startTS = frameTimestamps[0] * 1000000
  const endTS = frameTimestamps[frameTimestamps.length - 1] * 1000000
  const outputFrames = [] as GrabbedFrame[]
  const finishedPromise = makePromise<void>()
  let stopped = false

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
        const bitmap = await createImageBitmap(inputFrame, { resizeWidth, resizeHeight });
        outputFrames.push({ bitmap, time: inputFrame.timestamp / 1e6 });

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
  const track = info.videoTracks[0];
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
    }

    if (!description) throw new Error('no video description')

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

    for (; i < samples.length; i++) {
      const sample = samples[i];
      const timestamp = sample.cts * 1000000 / sample.timescale;

      if (timestamp > endTS) break;
      if (stopped) break;

      decoder.decode(new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: timestamp,
        duration: sample.duration * 1_000_000 / sample.timescale,
        data: sample.data
      }));
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
        bitmap: await createImageBitmap(video, { resizeWidth, resizeHeight }),
        time: frameTime
      })
      if (!reportProgress(i + 1, outputFrames.at(-1)!)) break
    }

    return outputFrames
  } finally {
    URL.revokeObjectURL(fileURL)
  }
}

export async function grabFrames(options: GrabFrameOptions) {
  try {
    return await grabFramesWithMP4Box(options);
  } catch (error) {
    reportError('MP4Box grabFrames error', error);

    if (confirm('MP4Box+WebCodec cannot decode this file. Try with video tag?')) {
      return await grabFramesWithVideoTag(options);
    }

    throw error;
  }
}
