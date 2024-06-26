import { Show, createEffect, createMemo, createRoot, type Component } from 'solid-js';
import { store, updateStore } from './store';
import { FileSelector } from './components/FileSelector';
import { OptionEditor } from './components/OptionEditor';
import { ProcessingBar } from './components/Processing';
import { OutputDisplay } from './components/OutputDisplay';
import { FileSelector2 } from './components/FileSelector2';

const App: Component = () => {
  let out = createMemo(() => {
    return store.outputFileURL && <OutputDisplay />
  })

  return (
    <div class="App">
      <header class='text-center my-20'>
        <h1 class='text-6xl font-thin my-10'>Video to GIF</h1>
        <p>Convert in local browser, no uploading</p>
      </header>

      <Show when={!store.fileInfo.url}>
        <FileSelector />
      </Show>

      {store.file && <FileSelector2 />}
      <Show when={store.fileInfo.url}>
        <div class='flex gap-4 mx-auto max-w-7xl flex-col lg:flex-row'>
          <div class="flex-1">
            <OptionEditor />

            <a
              href="#" class='mt-2 block text-slate-8 text-center hover:text-blue'
              onClick={() => updateStore({ file: null, fileInfo: { ...store.fileInfo, url: '' } })}
            >Choose another file...</a>
          </div>
          <div class="flex-1">
            <ProcessingBar />
            {out()}
          </div>
        </div>
      </Show>

      <footer class="text-center my-20">
        Made by @lyonbot, <a href="https://github.com/lyonbot/video-to-gif" class='text-blue' target='_blank'>Open-Sourced</a>
      </footer>
    </div>
  );
}

export default App;
