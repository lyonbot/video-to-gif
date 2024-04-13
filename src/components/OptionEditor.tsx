import { createComputed, createMemo, createSignal } from "solid-js";
import { outputSize, outputTimeRange, store, updateStore } from "../store";
import { startMouseMove } from 'yon-utils'

export function OptionEditor() {
  var videoEl: HTMLVideoElement
  const [videoTime, setVideoTime] = createSignal(0)
  const t2p = (t: number) => (t / store.fileInfo.duration) * 100 + '%'

  function seekTo(t: number) {
    setVideoTime(t);
    videoEl.pause();
    videoEl.currentTime = t
  }

  var timelineEl: HTMLDivElement

  function TimelineThumb(props: { class: string, time: number, onUpdate(t: number): void }) {
    return <div
      class={"w-4 h-full pos-absolute top-0 ml--2 cursor-ew-resize " + props.class}
      style={{ left: t2p(props.time) }}
      onPointerDown={ev => {
        ev.preventDefault()
        timelineEl.focus()

        const w = timelineEl.clientWidth
        const duration = videoEl.duration
        const t0 = props.time

        seekTo(t0)

        startMouseMove({
          initialEvent: ev,
          onMove(data) {
            let deltaT = data.deltaX / w * duration
            let t = t0 + deltaT
            if (t < 0) t = 0
            if (t > duration) t = duration

            if (Math.abs(t - t0) > 0.05) props.onUpdate(t)
          },
        })
      }}
    />
  }

  const handleSeekingOnBar = (e: PointerEvent) => {
    if (timelineEl === e.target) {
      const w = timelineEl.clientWidth;
      const duration = videoEl.duration;
      e.preventDefault();
      timelineEl.focus();

      startMouseMove({
        initialEvent: e,
        onMove(data) {
          let t = data.event.offsetX / w * duration;
          if (t < 0) t = 0;
          if (t > duration) t = duration;
          seekTo(t);
        }
      });
    }
  };

  const handleKeypressOnBar = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowLeft':
        seekTo(videoTime() - 0.2)
        e.preventDefault();
        break;

      case 'ArrowRight':
        seekTo(videoTime() + 0.2)
        e.preventDefault();
        break;

      case 'ArrowUp':
        seekTo(videoTime() - 1)
        e.preventDefault();
        break;

      case 'ArrowDown':
        seekTo(videoTime() + 1)
        e.preventDefault();
        break;

      case 'Space':
        videoEl.paused ? videoEl.play() : videoEl.pause()
        e.preventDefault();
        break;
    }
  }

  function OptionGroupHeader(props: { children: any }) {
    return <h3 class="font-normal p-2 px-4 rounded leading-none text-cyan-1 mt-12">{props.children}</h3>
  }

  function OptionLabel(props: { children: any }) {
    return <label class="op-60 inline-block w-24 text-right mr-2">{props.children}</label>
  }

  return <div>

    <div class="mx-auto max-w-4xl relative flex flex-col bg-gray-8 text-white rounded-xl overflow-hidden">
      <video ref={x => (videoEl = x)} src={store.fileInfo.url} class="w-full h-64 outline-0" controls ontimeupdate={x => setVideoTime(x.currentTarget.currentTime)} />
      <div
        class="flex h-4 relative overflow-hidden outline-0 bg-gray-9 b-0 b-solid b-b-5 b-black"
        ref={e => (timelineEl = e)}
        onPointerDown={handleSeekingOnBar} tabindex={-1} onKeyDown={handleKeypressOnBar}
      >
        <TimelineThumb class="bg-yellow" time={videoTime()} onUpdate={seekTo} />
        <TimelineThumb class="bg-green" time={store.options.start} onUpdate={t => { seekTo(t), updateStore('options', 'start', t) }} />
        <TimelineThumb class="bg-blue" time={store.options.end} onUpdate={t => { seekTo(t), updateStore('options', 'end', t) }} />
      </div>
      <div class="flex">
        <div style={{ "width": t2p(videoTime()), "flex-shrink": 1 }}></div>
        <div class="flex shrink-0 b-0 b-l-4 b-solid b-yellow ml--0.5">
          <button class="bg-gray-7 b-0 text-gray-2 cursor-pointer hover:bg-gray-5" onClick={() => { updateStore('options', 'start', videoTime()) }}>
            <i class="i-mdi-arrow-expand-right"></i> as start
          </button>
          <NumberInput precise={2} value={videoTime()} onChange={seekTo} />
          <button class="bg-gray-7 b-0 text-gray-2 cursor-pointer hover:bg-gray-5" onClick={() => { updateStore('options', 'end', videoTime()) }}>
            as end <i class="i-mdi-arrow-expand-left"></i>
          </button>
        </div>
      </div>

      <div class='mb-4'>
        <OptionGroupHeader>
          <i class="i-mdi-content-cut"></i> Trimming
        </OptionGroupHeader>

        <div>
          <OptionLabel>Range</OptionLabel>
          <NumberInput class="b-green b-solid b-l-4" precise={2} value={store.options.start} onChange={t => { updateStore('options', 'start', t); seekTo(t) }} />
          {" - "}
          <NumberInput class="b-blue b-solid b-l-4" precise={2} value={store.options.end} onChange={t => { updateStore('options', 'end', t); seekTo(t) }} />
        </div>

        <div>
          <OptionLabel> <i class="i-mdi-play-speed"></i> Speed</OptionLabel>
          <NumberInput defaults={1} precise={2} value={store.options.speed} onChange={t => { updateStore('options', 'speed', t); videoEl.playbackRate = t }} min={0.01} max={10} />x
        </div>

        <div>
          <OptionLabel>Framerate</OptionLabel>
          <NumberInput value={store.options.framerate} onChange={t => { updateStore('options', 'framerate', t); }} min={1} max={60} /> frames per second
        </div>

        <div>
          <OptionLabel>Duration</OptionLabel>
          ≈ {outputTimeRange().duration.toFixed(2)}s ({outputTimeRange().frameCount} frames)
        </div>

        <OptionGroupHeader>
          <i class="i-mdi-move-resize"></i> Dimension
        </OptionGroupHeader>

        <div>
          <OptionLabel>Width</OptionLabel>
          <NumberInput value={store.options.width} defaults={-1} onChange={t => { updateStore('options', 'width', t) }} />
          {store.options.width === -1 && <span class="op-70 ml-2">(auto)</span>}
        </div>

        <div>
          <OptionLabel>Height</OptionLabel>
          <NumberInput value={store.options.height} defaults={-1} onChange={t => { updateStore('options', 'height', t) }} />
          {store.options.height === -1 && <span class="op-70 ml-2">(auto)</span>}
        </div>

        <div>
          <OptionLabel>Original</OptionLabel>
          {store.fileInfo.width} × {store.fileInfo.height}
        </div>

        <div>
          <OptionLabel>Output</OptionLabel>
          {outputSize().width} × {outputSize().height}
        </div>

        <OptionGroupHeader>
          <i class="i-mdi-package-down"></i> GIF Output
        </OptionGroupHeader>

        <div>
          <OptionLabel>Max Colors</OptionLabel>
          <select
            class="bg-gray-6 text-white b-0 p-2 py-1"
            value={store.options.maxColors}
            onChange={e => { updateStore('options', 'maxColors', parseInt(e.currentTarget.value)) }}
          >
            {[255, 128, 64, 32, 24, 16, 8, 4].map(x => <option value={x}>{x}</option>)}
          </select>
        </div>

      </div>
    </div>
  </div>
}

function NumberInput(props: {
  value: number
  defaults?: number
  precise?: number
  onChange?: (v: number) => void
  class?: string
  min?: number
  max?: number
}) {
  const getDisplayNum = () => props.value.toFixed(props.precise ?? 0)
  return <input
    class={"b-0 bg-gray-6 selection:bg-black text-white font-mono p-1 w-24 text-right text-inherit outline-0 " + (props.class || '')}
    value={getDisplayNum()}
    min={props.min}
    max={props.max}
    onChange={e => {
      const val = parseFloat(e.currentTarget.value);
      if (Number.isNaN(val)) {
        e.currentTarget.value = String(props.defaults ?? getDisplayNum())
        if (typeof props.defaults === 'number') props.onChange?.(props.defaults)
        return
      }
      return props.onChange?.(val);
    }}
  />
}
