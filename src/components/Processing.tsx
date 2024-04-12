import { Show, createEffect } from "solid-js";
import { store, updateStore } from "../store";

export function ProcessingBar() {
  let prevMediumHash = '';
  createEffect(() => {
    store.file; // when file changes
    prevMediumHash = ''; // reset hash
  })

  async function startProcess() {
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
      '-vf', `fps=${options.framerate || 12},split[a][b];[a]palettegen=max_colors=${options.colorCount}[pal];[b][pal]paletteuse=dither=bayer`,
      '-y', outputFilename
    ])
    console.log('stage2 exit code = ' + stage2Out)

    // const argsRaw = [
    //   options.start > 0 && ['-ss', options.start.toString()],
    //   options.end < store.fileInfo.duration && ['-to', options.end.toString()],
    //   ['-an'],
    //   ['-vf', `${vf.join(',')},split[a][b];[a]palettegen=max_colors=${options.colorCount}[pal];[b][pal]paletteuse=dither=bayer`],
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

  return <div class="sticky bottom-0 left-0 w-full bg-gray-200">
    <Show when={!store.ffmpeg}>
      <i class="i-mdi-loading animate-spin"></i> ffmpeg is loading...
    </Show>
    <button class="startButton" onClick={() => startProcess().catch(error => {
      console.error(error)
    })}>Start Process</button>
  </div>
}