import { Show, createMemo, createSignal } from "solid-js";
import { encode as GIFEncode } from 'modern-gif'
import GIFWorkerJS from 'modern-gif/worker?url'
import { outputSize, outputTimeRange, store, updateStore } from "../store";
import { grabFramesWithMP4Box } from "../processors/frameGrabber";
import { delay } from "yon-utils";
import { unwrap } from "solid-js/store";
import { getWatermarkRenderer } from "../processors/watermarkRenderer";

export function ProcessingBar() {
  let [isRunning, setIsRunning] = createSignal(false)
  let [progress, setProgress] = createSignal('');
  let [percentage, setPercentage] = createSignal(0);
  let [errorMessage, setErrorMessage] = createSignal('');

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
      '-vf', `split[a][b];[a]palettegen=max_colors=${options.maxColors}[pal];[b][pal]paletteuse=dither=${options.ditcher}`,
      '-y', outputFilename
    ])
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
    const frames = await grabFrames()

    setProgress('Packing frames');
    setPercentage(-1);
    await delay(10);

    const watermarkRenderer = await getWatermarkRenderer({
      watermark: store.watermarks[store.options.watermarkIndex],
      sourceWidth: frames[0].bitmap.width,
      sourceHeight: frames[0].bitmap.height,
    })
    const { oWidth: width, oHeight: height } = watermarkRenderer

    const frameDataSize = width * height * 4;
    const buffer = new ArrayBuffer(frameDataSize * frames.length);
    const combined = new Uint8Array(buffer);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const imageData = watermarkRenderer.getWatermarkedImageData(frame.bitmap)
      combined.set(imageData.data, i * frameDataSize);
      frame.bitmap.close();
    }

    return { combined, width, height, frameCount: frames.length, frameDataSize };
  }

  async function grabFrames() {
    const { sourceStart, sourceEnd, frameCount } = outputTimeRange()
    const { file } = store
    if (!file) throw new Error('no file')

    setProgress('Grabbing Frames')
    setPercentage(0)

    const frames = await grabFramesWithMP4Box({
      file,
      resizeWidth: outputSize().width,
      resizeHeight: outputSize().height,
      frameTimestamps: Array.from({ length: frameCount }, (_, i) => sourceStart + i * (sourceEnd - sourceStart) / frameCount),
      reportProgress(grabbedCount, frame) {
        setPercentage(grabbedCount / frameCount * 100)

        // debugging
        // const can = document.createElement('canvas')
        // can.width = frame.bitmap.width
        // can.height = frame.bitmap.height
        // document.body.appendChild(can)
        // const ctx = can.getContext('2d')!
        // ctx.drawImage(frame.bitmap, 0, 0)

        return isRunning()
      },
    })

    if (!isRunning()) throw new Error('Progress aborted')
    return frames
  }

  function startProcess() {
    setIsRunning(true)
    setErrorMessage('')
    console.time('process')

    const run = isUseFFMpeg() ? processWithFFMpeg : processWithGIFjs;
    run().catch(error => {
      console.error(error)
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
    <div class="text-center my-2 mb-4 text-gray text-xs flex flex-col gap-2">
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
      when={outputTimeRange().frameCount > 200}
      message="too many frames yield large GIF. please trim the video, or lowing framerate."
    />

    <Show when={errorMessage()}>
      <div class="text-center my-4 text-red-7">
        <i class="i-mdi-alert-circle"></i> {errorMessage()}
      </div>
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