import { Show } from "solid-js";
import { store } from "../store";

function readableFileSize(size: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, unitIndex)).toFixed(2) + ' ' + units[unitIndex];
}

export function OutputDisplay() {
  return <Show when={store.outputFileURL}>
    <section>
      <h2>Output</h2>
      <p>File size: {readableFileSize(store.outputFileContent?.length || 0)}</p>
      <p>
        <a download="output.gif" href={store.outputFileURL}>
          <i class="i-mdi-download"></i>
          Download GIF
        </a>
      </p>
      <img src={store.outputFileURL} alt="output" />
    </section>
  </Show>
}