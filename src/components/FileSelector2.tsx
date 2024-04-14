import { Show, createEffect, createSignal, on, onCleanup } from "solid-js"
import { updateStore } from "../store"

// Unlike ./FileSelector, this handle global DnD event
export function FileSelector2() {
  const [isAboutDrop, setIsAboutDrop] = createSignal(false)
  // const [fileToDrop, setFileToDrop] = createSignal<File>()

  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer && e.dataTransfer.types[0] === 'Files') {
      e.preventDefault()
      e.stopPropagation()
      setIsAboutDrop(true)
    }
  }
  window.addEventListener('dragover', handleDragOver, true)
  onCleanup(() => window.removeEventListener('dragover', handleDragOver, true))

  createEffect(on(isAboutDrop, (isAboutDrop) => {
    if (!isAboutDrop) return

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget) return // avoid blinking event loop
      setIsAboutDrop(false);
    }
    window.addEventListener('dragleave', handleDragLeave)

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsAboutDrop(false)

      const files = e.dataTransfer?.files
      if (!files) return

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!(file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name))) continue

        // setFileToDrop(file)
        updateStore({ file })
        break
      }
    }
    window.addEventListener('drop', handleDrop)

    onCleanup(() => {
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    })
  }))

  return <Show when={isAboutDrop()}>
    <div class="inset-0 fixed z-1 bg-op-70 bg-white text-black flex">
      <div class="m-8 text-center text-3xl flex flex-1 flex-col items-center justify-center gap-2 rounded-xl b-4 b-dashed">
        <div><i class="i-mdi-file-video text-5xl"></i></div>
        <div class="font-bold">Drop Video File...</div>
        <div class="text-base">
          Current video will be closed!
        </div>
      </div>
    </div>
  </Show>
}