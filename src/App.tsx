import { Show, createEffect, createRoot, type Component } from 'solid-js';
import { store } from './store';
import { FileSelector } from './components/FileSelector';
import { OptionEditor } from './components/OptionEditor';

const App: Component = () => {
  return (
    <div class="App">
      <section>
        <h2>Step1. Choose a file</h2>
        <FileSelector />
      </section>

      <Show when={!!store.fileInfo.url}>
        <section>
          <h2>Step2. Options</h2>
          <OptionEditor />
        </section>
      </Show>

      <Show when={!store.ffmpeg}>
        <div class="bg-amber">
          ffmpeg is loading...
        </div>
      </Show>
    </div>
  );
}

export default App;
