import { createComputed, createMemo, createSignal } from "solid-js";
import { store, updateStore } from "../store";

export function OptionEditor() {
  var videoEl: HTMLVideoElement
  const [videoTime, setVideoTime] = createSignal(0)
  const t2p = (t: number) => (t / store.fileInfo.duration) * 100 + '%'

  const outSize = createMemo(() => {
    const { width: ow, height: oh } = store.fileInfo;
    const { width: nw, height: nh } = store.options;

    let w = nw, h = nh;
    if (nw === -1 && nh === -1) { w = ow; h = oh; }
    else if (nw === -1) { w = ow * (nh / oh); }
    else if (nh === -1) { h = oh * (nw / ow); }

    return { width: Math.floor(w), height: Math.floor(h) }
  })

  return <div>

    <div class="mx-auto max-w-4xl relative flex flex-col bg-gray-8 text-white rounded-xl overflow-hidden">
      <video ref={x => (videoEl = x)} src={store.fileInfo.url} class="w-full h-64 outline-0" controls ontimeupdate={x => setVideoTime(x.currentTarget.currentTime)} />
      <div class="flex h-4 relative overflow-hidden">
        <div class="w-4 h-full pos-absolute top-0 ml--2 bg-yellow" style={{ left: t2p(videoTime()) }}></div>
        <div class="w-4 h-full pos-absolute top-0 ml--2 bg-green" style={{ left: t2p(store.options.start) }}></div>
        <div class="w-4 h-full pos-absolute top-0 ml--2 bg-blue" style={{ left: t2p(store.options.end) }}></div>
      </div>
      <div class="flex">
        <div style={{ "width": t2p(videoTime()), "flex-shrink": 1 }}></div>
        <div class="flex shrink-0 b-0 b-l-4 b-solid b-yellow ml--0.5">
          <button class="bg-gray-7 b-0 text-gray-2 cursor-pointer hover:bg-gray-5" onClick={() => { updateStore('options', 'start', videoTime()) }}>
            <i class="i-mdi-arrow-expand-right"></i> as start
          </button>
          <NumberInput precise={2} value={videoTime()} onChange={t => { videoEl.currentTime = t }} />
          <button class="bg-gray-7 b-0 text-gray-2 cursor-pointer hover:bg-gray-5" onClick={() => { updateStore('options', 'end', videoTime()) }}>
            as end <i class="i-mdi-arrow-expand-left"></i>
          </button>
        </div>
      </div>

      <div class='m-2 my-8'>
        <h3>Time</h3>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Range</label>
          <NumberInput class="b-green b-solid b-l-4" precise={2} value={store.options.start} onChange={t => { updateStore('options', 'start', t); setVideoTime(t) }} />
          {" - "}
          <NumberInput class="b-blue b-solid b-l-4" precise={2} value={store.options.end} onChange={t => { updateStore('options', 'end', t); setVideoTime(t) }} />
        </div>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Speed</label>
          <NumberInput precise={2} value={store.options.speed} onChange={t => { updateStore('options', 'speed', t); videoEl.playbackRate = t }} min={0.01} max={10} />x
        </div>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Framerate</label>
          <NumberInput value={store.options.framerate} onChange={t => { updateStore('options', 'framerate', t); }} min={1} max={60} /> frames per second
        </div>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Duration</label>
          ≈ {((store.options.end - store.options.start) / store.options.speed).toFixed(2)}s
        </div>

        <h3>Dimension</h3>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Width</label>
          <NumberInput value={store.options.width} onChange={t => { updateStore('options', 'width', t) }} />
          {store.options.width === -1 && <span class="op-70 ml-2">(auto)</span>}
        </div>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Height</label>
          <NumberInput value={store.options.height} onChange={t => { updateStore('options', 'height', t) }} />
          {store.options.height === -1 && <span class="op-70 ml-2">(auto)</span>}
        </div>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Original</label>
          {store.fileInfo.width} × {store.fileInfo.height}
        </div>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Ouput</label>
          {outSize().width} × {outSize().height}
        </div>

        <h3>Color</h3>

        <div>
          <label class="font-bold inline-block w-24 text-right mr-2">Color Count</label>
          <select value={store.options.colorCount} onChange={e => { updateStore('options', 'colorCount', parseInt(e.currentTarget.value)) }}>
            {[256, 128, 64, 32, 24, 16, 8, 4].map(x => <option value={x}>{x}</option>)}
          </select>
        </div>

      </div>
    </div>
  </div>
}

function NumberInput(props: {
  value: number
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
        e.currentTarget.value = getDisplayNum()
        return
      }
      return props.onChange?.(val);
    }}
  />
}
