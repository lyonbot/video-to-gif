import { Show } from "solid-js";
import { store } from "../store";

function readableFileSize(size: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, unitIndex)).toFixed(2) + ' ' + units[unitIndex];
}

export function OutputDisplay() {
  return <Show when={store.outputFileURL}>
    <section class="bg-slate-2 rounded-xl p-4 mt-4 animate-zoom-in animate-duration-300 animate-ease-out">
      <h2>Output</h2>
      <p>File size: {readableFileSize(store.outputFileContent?.length || 0)}</p>
      <p>
        <a
          class="decoration-none text-blue-500 hover:underline"
          download={store.file!.name + ".gif"} href={store.outputFileURL}
        >
          <i class="i-mdi-download mr-1"></i>
          Download GIF
        </a>
      </p>
      <img src={store.outputFileURL} alt="output" class="block mx-auto max-w-full rounded-xl" />
    </section>
  </Show>
}