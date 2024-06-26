import { Show, createEffect, createMemo, createRoot, createSignal } from "solid-js";
import { encode as GIFEncode } from 'modern-gif'
import GIFWorkerJS from 'modern-gif/worker?url'
import { outputSize, outputTimeRange, store, updateStore } from "../store";
import { grabFrames as grabFrames1 } from "../processors/frameGrabber";
import { unwrap } from "solid-js/store";
import { getWatermarkRenderer } from "../processors/watermarkRenderer";
import { reportError } from "../report";

export function ProcessingBar() {
  let [isRunning, setIsRunning] = createSignal(false)
  let [progress, setProgress] = createSignal('');
  let [percentage, setPercentage] = createSignal(0);
  let [errorMessage, setErrorMessage] = createSignal('');

  const errorHint = createMemo(() => {
    const msg = errorMessage()
    if (!msg) return null

    if (/allocation failed/.test(msg)) return "Please reduce the width / height / framerate / duration, and try again"
  })

  let [isUseFFMpeg, setIsUseFFMpeg] = createSignal(true);

  async function processWithGIFjs() {
    const fetched = await grabFramesAndCombine()
    const { outputFrameDurationMS } = outputTimeRange()

    const frames: { data: Uint8Array, delay: number }[] = Array.from({ length: fetched.frameCount }, (_, i) => {
      const data = fetched.combined.slice(i * fetched.frameDataSize, (i + 1) * fetched.frameDataSize)
      return {
        data,
        delay: outputFrameDurationMS[i]
      }
    })

    setPercentage(-1)
    setProgress('Encoding to GIF')
    console.time('encoding to gif')
    const output = await GIFEncode({
      workerUrl: GIFWorkerJS as unknown as string,
      width: outputSize().width,
      height: outputSize().height,
      maxColors: store.options.maxColors,
      format: "arrayBuffer",
      frames,
    })
    console.timeEnd('encoding to gif')

    setPercentage(100)
    setProgress('Finished')
    updateStore({
      outputFileContent: new Uint8Array(output),
    })

    // await workerReady
    // worker.postMessage({
    //   options: store.options,
    //   outputSize: outputSize(),
    // })
  }

  async function processWithFFMpeg() {
    const { file, options } = store;
    const ffmpeg = unwrap(store.ffmpeg);

    if (!ffmpeg) throw new Error('no ffmpeg')
    if (!file) throw new Error('no file')

    //@ts-ignore
    window.ffmpeg = ffmpeg
    ffmpeg.on('log', ({ type, message }) => {
      console.log('FF', type, message)
    })
    ffmpeg.on('progress', ({ progress, time }) => {
      setPercentage((progress > 1 || progress < 0) ? -1 : (progress * 100))
      console.log('FFProgress', progress, time)
    })

    // const inputFilename = 'input' + /\.\w+$/.exec(file.name || '.mp4')![0]
    const outputFilename = 'output.gif'

    // read file content to data
    // const inputData = await file.arrayBuffer()
    // await ffmpeg.writeFile(inputFilename, new Uint8Array(inputData))

    // let vf: string[] = []
    // vf.push(`fps=${options.framerate || 12}`)
    // if (options.width !== -1 || options.height !== -1) {
    //   vf.push(`scale=${options.width}:${options.height}`)
    // }
    // if (options.speed !== 1) {
    //   vf.push(`setpts=PTS/${options.speed}`)
    //   vf.push(`fps=${options.framerate || 12}`)
    // }


    // --------------------------------------------------
    // stage1
    // const stage1Filename = 'medium.mov'
    // const stage1Args = [
    //   options.start > 0 && ['-ss', options.start.toString()],
    //   options.end < store.fileInfo.duration && ['-to', options.end.toString()],
    //   ['-an'],
    //   ['-vf', `${vf.join(',')}`],
    //   ['-vcodec', 'ffv1'],
    //   ['-y', stage1Filename]
    // ].filter(Boolean) as string[][]

    // let currentStage1Hash = stage1Args.map(a => a.join('/')).join('/')
    // if (currentStage1Hash === prevMediumHash) {
    //   console.log('skip stage1')
    // } else {
    //   prevMediumHash = currentStage1Hash
    //   console.log('stage1 args = ', stage1Args)
    //   const stage1Out = await ffmpeg.exec(['-i', inputFilename].concat(...stage1Args))
    //   console.log('stage1 exit code = ' + stage1Out)
    // }

    // use WebCodec to decode file, which is much faster!
    const stage1Filename = 'medium.raw'
    const stage1DecodeArgs: string[] = []
    const abortSignal = createRoot((dispose) => {
      const controller = new AbortController()
      createEffect(() => {
        if (!isRunning()) {
          controller.abort()
          dispose()
        }
      })
      return controller.signal
    })
    {
      const { width, height, frameCount, combined } = await grabFramesAndCombine()

      setProgress('Sending to FFMpeg')
      setPercentage(-1)
      await ffmpeg.writeFile(stage1Filename, combined)
      stage1DecodeArgs.push(
        '-f', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-video_size', `${width}x${height}`,
        '-framerate', String(Math.round(frameCount / outputTimeRange().duration)),
      )
    }

    //----------------------------------------------
    // stage2
    setProgress('Encoding GIF with FFMpeg')
    setPercentage(-1)
    const stage2Out = await ffmpeg.exec([
      ...stage1DecodeArgs,
      '-i', stage1Filename,
      '-vf', `split[a][b];[a]palettegen=max_colors=${options.maxColors}[pal];[b][pal]paletteuse=dither=${options.dither}`,
      '-y', outputFilename
    ], undefined, { signal: abortSignal })
    console.log('stage2 exit code = ' + stage2Out)

    // const argsRaw = [
    //   options.start > 0 && ['-ss', options.start.toString()],
    //   options.end < store.fileInfo.duration && ['-to', options.end.toString()],
    //   ['-an'],
    //   ['-vf', `${vf.join(',')},split[a][b];[a]palettegen=max_colors=${options.maxColors}[pal];[b][pal]paletteuse=dither=bayer`],
    //   ['-y', outputFilename]
    // ].filter(Boolean) as string[][]
    // console.log('run1 args = ', argsRaw)

    // // start process
    // const ans1 = await ffmpeg.exec(['-i', inputFilename].concat(...argsRaw))
    // console.log('exit code1 = ' + ans1)

    // read file content to data
    const outputData = await ffmpeg.readFile(outputFilename)
    updateStore('outputFileContent', outputData)
  }

  async function grabFramesAndCombine() {
    const { sourceStart, sourceEnd, frameCount: estimatedFrameCount } = outputTimeRange()
    const { file, fileContent } = store
    if (!file || !fileContent) throw new Error('no file')

    setProgress('Allocating RAM')

    const { width, height } = outputSize()
    const frameDataSize = width * height * 4;
    const buffer = new ArrayBuffer(frameDataSize * estimatedFrameCount);
    const combined = new Uint8Array(buffer);
    let frameCount = 0;

    setProgress('Grabbing Frames')
    setPercentage(0)

    const watermarkRenderer = await getWatermarkRenderer({
      watermark: store.watermarks[store.options.watermarkIndex],
      sourceWidth: width,
      sourceHeight: height,
    })

    const progressSyncTimer = setInterval(() => { setPercentage(frameCount / estimatedFrameCount * 100) }, 150)
    try {

      await grabFrames1({
        fileContent,
        fileExtname: store.fileInfo.extname,
        fileURL: store.fileInfo.url,

        resizeWidth: outputSize().width,
        resizeHeight: outputSize().height,
        frameTimestamps: Array.from({ length: estimatedFrameCount }, (_, i) => sourceStart + i * (sourceEnd - sourceStart) / estimatedFrameCount),
        reportProgress(grabbedCount, frame) {
          const imageData = watermarkRenderer.getWatermarkedImageData(frame.image)
          combined.set(imageData.data, (grabbedCount - 1) * frameDataSize);
          frameCount = grabbedCount

          return isRunning()
        },
        ffmpeg: unwrap(store.ffmpeg),
      })
    } finally {
      clearInterval(progressSyncTimer)
    }

    if (!isRunning()) throw new Error('Progress aborted');

    return {
      combined: combined.slice(0, frameCount * frameDataSize),
      width,
      height,
      frameCount,
      frameDataSize,
    };
  }

  function startProcess() {
    if (outputSize().width <= 0 || outputSize().height <= 0) {
      alert('Invalid output size');
      return;
    }

    setIsRunning(true);
    (document.querySelector('video.optionEditor-video') as HTMLVideoElement)?.pause()
    setErrorMessage('')
    console.time('process')

    const run = isUseFFMpeg() ? processWithFFMpeg : processWithGIFjs;
    run().catch(error => {
      reportError('convert error', error)
      setErrorMessage(String(error))
    }).then(() => {
      console.timeEnd('process')
      setIsRunning(false)
    })
  }

  return <div class="relative my-10 bg-white">
    {
      !isRunning()
        ? <button class="startButton" disabled={!store.ffmpeg && isUseFFMpeg()} onClick={startProcess}> <i class="i-mdi-play"></i> Convert to GIF</button>
        : <button class="stopButton" onClick={() => setIsRunning(false)}>Stop</button>
    }

    {/* engine */}
    <div class="text-center my-2 mb-4 text-gray text-sm flex flex-col gap-2">
      <div>
        {
          isUseFFMpeg()
            ? <><i class="i-mdi-application-cog"></i> encode with ffmpeg</>
            : <><i class="i-mdi-google-chrome"></i> encode with JavaScript</>
        }

        <a
          class="ml-2 text-inherit hover:text-blue"
          classList={{ 'pointer-events-none op-60': isRunning() }}
          href="#"
          onClick={(e) => { e.preventDefault(); setIsUseFFMpeg(!isUseFFMpeg()) }}
        >
          (Change)
        </a>
      </div>

      <Show when={!store.ffmpeg && isUseFFMpeg()}>
        <div class="text-gray">
          <span class="animate-flash animate-iteration-count-10 animate-duration-4000"><i class="i-mdi-loading animate-spin"></i> ffmpeg is loading...</span>
          <a class="ml-2 text-blue" href="#" onClick={(e) => { e.preventDefault(); setIsUseFFMpeg(false) }}>(Switch to other encoder)</a>
        </div>
      </Show>
    </div>

    <WarningMsg
      when={outputSize().width > 600}
      message={`width ${outputSize().width} is kinda large.`}
      fix={() => updateStore('options', 'width', 600)}
    />
    <WarningMsg
      when={outputSize().height > 600}
      message={`height ${outputSize().height} is kinda large.`}
      fix={() => updateStore('options', 'height', 600)}
    />
    <WarningMsg
      when={outputTimeRange().frameCount > 250}
      message={`frame count ${outputTimeRange().frameCount} can be decreased with framerate, trimming and speed-up`}
    />

    <Show when={errorMessage()}>
      <div class="text-center my-4 text-red-7">
        <i class="i-mdi-alert-circle"></i> {errorMessage()}
      </div>

      <Show when={errorHint()}>
        <div class="text-center my-4 mt--2 text-orange">
          {errorHint()}
        </div>
      </Show>
    </Show>

    <Show when={isRunning()}>
      <div class="text-center my-4">
        <i class="i-mdi-loading animate-spin mr-1"></i>
        {progress()}
      </div>
      <Show when={percentage() >= 0}>
        <div class="relative max-w-lg h-2 bg-gray-3 mx-auto rounded overflow-hidden">
          <div class="h-full bg-blue-5 transition" style={{ width: `${percentage()}%` }}></div>
        </div>
      </Show>
    </Show>
  </div>
}

function WarningMsg(props: { message: string, when: any, fix?: () => void }) {
  return <Show when={props.when}>
    <div class="text-left text-gray text-sm">
      <i class="i-mdi-info-circle"></i> {props.message}
      {props.fix && <a class="ml-2 text-blue" href="#" onClick={e => { e.preventDefault(); props.fix!() }}>(Fix It)</a>}
    </div>
  </Show>
}
