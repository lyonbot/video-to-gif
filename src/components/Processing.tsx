import { Show, createEffect, createSignal } from "solid-js";
import { encode as GIFEncode } from 'modern-gif'
import GIFWorkerJS from 'modern-gif/worker?url'
import { outputSize, store, updateStore } from "../store";

export function ProcessingBar() {
  let prevMediumHash = '';
  let prevMediumData: any
  createEffect(() => {
    store.file; // when file changes
    prevMediumHash = ''; // reset hash
    prevMediumData = null
  })
  const computeMediumHash = () => {
    const { file, options } = store;
    if (!file) return ''

    return [options.framerate, options.width, options.height, options.start, options.end, options.speed].join('/')
  }

  let [isRunning, setIsRunning] = createSignal(false)
  let [progress, setProgress] = createSignal('');
  let [percentage, setPercentage] = createSignal(0);

  async function processWithGIFjs() {
    const frames = [] as { data: Uint8ClampedArray, t: number }[]

    let mediumHash = computeMediumHash()
    if (prevMediumData && prevMediumHash === mediumHash) {
      // use cached data
      frames.push(...prevMediumData)
    } else {
      // recompute 
      prevMediumData = null
      prevMediumHash = ''

      setPercentage(0)
      setProgress('Loading video file')

      const video = document.createElement('video')
      const videoReady = new Promise(r => video.onloadedmetadata = r)
      video.muted = true
      video.src = store.fileInfo.url

      const canvas = document.createElement('canvas')
      canvas.width = outputSize().width
      canvas.height = outputSize().height

      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      await videoReady
      const videoPlaying = new Promise(r => video.onplaying = r)
      video.currentTime = store.options.start
      video.play()
      await videoPlaying
      video.pause()
      video.currentTime = store.options.start
      video.onplaying = null

      // const captureStream = (video as any).captureStream()
      // const videoTrack = captureStream.getVideoTracks()[0]
      // const imageCapture = new ImageCapture(videoTrack)

      setProgress('Grabbing frames')
      const frameCount = Math.max(1, Math.floor((store.options.end - store.options.start) / store.options.speed * store.options.framerate))
      for (let i = 0; i < frameCount; i++) {
        if (!isRunning()) return;

        const frameTime = store.options.start + i * (store.options.end - store.options.start) / frameCount
        const seekEnd = new Promise(r => video.onseeked = r)
        video.currentTime = frameTime
        await seekEnd

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        frames.push({ data, t: Math.round((frameTime - store.options.start) / store.options.speed * 1000) })

        setPercentage(i / frameCount * 100)
      }

      prevMediumHash = mediumHash
      prevMediumData = frames
    }

    setPercentage(-1)
    setProgress('Encoding to GIF')
    const output = await GIFEncode({
      workerUrl: GIFWorkerJS as unknown as string,
      width: outputSize().width,
      height: outputSize().height,
      maxColors: store.options.maxColors,
      format: "arrayBuffer",

      frames: frames.map((f, i) => {
        const delay = i < frames.length - 1 ? frames[i + 1].t - f.t : Math.round(1000 / store.options.framerate)
        return {
          data: f.data,
          delay
        }
      }),
    })

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
    const { ffmpeg, file, options } = store;
    if (!ffmpeg) throw new Error('no ffmpeg')
    if (!file) throw new Error('no file')

    //@ts-ignore
    window.ffmpeg = ffmpeg
    ffmpeg.on('log', ({ type, message }) => {
      console.log('FF', type, message)
    })
    ffmpeg.on('progress', ({ progress, time }) => {
      console.log('FFProgress', progress, time)
    })

    const inputFilename = 'input' + /\.\w+$/.exec(file.name || '.mp4')![0]
    const outputFilename = 'output.gif'

    // read file content to data
    const inputData = await file.arrayBuffer()
    await ffmpeg.writeFile(inputFilename, new Uint8Array(inputData))

    let vf: string[] = []
    vf.push(`fps=${options.framerate || 12}`)
    if (options.width !== -1 || options.height !== -1) {
      vf.push(`scale=${options.width}:${options.height}`)
    }
    if (options.speed !== 1) {
      vf.push(`setpts=PTS/${options.speed}`)
      vf.push(`fps=${options.framerate || 12}`)
    }


    // --------------------------------------------------
    // stage1
    const stage1Filename = 'medium.mov'
    const stage1Args = [
      options.start > 0 && ['-ss', options.start.toString()],
      options.end < store.fileInfo.duration && ['-to', options.end.toString()],
      ['-an'],
      ['-vf', `${vf.join(',')}`],
      ['-vcodec', 'ffv1'],
      ['-y', stage1Filename]
    ].filter(Boolean) as string[][]

    let currentStage1Hash = stage1Args.map(a => a.join('/')).join('/')
    if (currentStage1Hash === prevMediumHash) {
      console.log('skip stage1')
    } else {
      prevMediumHash = currentStage1Hash
      console.log('stage1 args = ', stage1Args)
      const stage1Out = await ffmpeg.exec(['-i', inputFilename].concat(...stage1Args))
      console.log('stage1 exit code = ' + stage1Out)
    }

    //----------------------------------------------
    // stage2
    const stage2Out = await ffmpeg.exec([
      '-i', stage1Filename,
      '-vf', `fps=${options.framerate || 12},split[a][b];[a]palettegen=max_colors=${options.maxColors}[pal];[b][pal]paletteuse=dither=bayer`,
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

  function startProcess() {
    setIsRunning(true)
    processWithGIFjs().catch(error => {
      console.error(error)
    }).then(() => {
      setIsRunning(false)
    })
  }

  return <div class="relative my-10 bg-white">
    {/* <Show when={!store.ffmpeg}>
      <i class="i-mdi-loading animate-spin"></i> ffmpeg is loading...
    </Show> */}

    {
      !isRunning()
        ? <button class="startButton" onClick={startProcess}> <i class="i-mdi-play"></i> Convert to GIF</button>
        : <button class="stopButton" onClick={() => setIsRunning(false)}>Stop</button>
    }

    <Show when={isRunning()}>
      <div class="text-center my-2">
        <i class="i-mdi-loading animate-spin mr-1"></i>
        {progress()}
      </div>
      <Show when={percentage() >= 0}>
        <div class="relative max-w-lg h-2 bg-gray-3 mx-auto rounded overflow-hidden">
          <div class="h-full bg-blue-500 transition" style={{ width: `${percentage()}%` }}></div>
        </div>
      </Show>
    </Show>
  </div>
}