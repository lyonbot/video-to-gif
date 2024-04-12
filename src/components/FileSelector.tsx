import { createSignal, type Component } from 'solid-js';
import { updateStore } from '../store';

export const FileSelector: Component = () => {
  var fileInput: HTMLInputElement;
  var [isAboutToDrop, setIsAboutToDrop] = createSignal(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.files.length) {
      updateStore({ file: e.dataTransfer.files[0] });
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items?.length) {
      const file = items[0].getAsFile();
      updateStore({ file });
    }
  };

  return (
    <div
      class="uploadAcceptArea"
      classList={{ dragOver: isAboutToDrop() }}
      tabIndex={0}
      onDragOver={e => { e.preventDefault(); setIsAboutToDrop(true); }}
      onDragLeave={e => { e.preventDefault(); setIsAboutToDrop(false); }}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={() => { fileInput.value = ""; fileInput.click(); }}
    >
      <input class='hidden w-0 h-0' ref={x => (fileInput = x)} type="file" accept="video/*" onChange={e => updateStore({ file: e.target.files![0] })} />
      <div class='i-mdi-movie-open text-8xl block m-a'></div>
      <div>
        Upload or drop file here
      </div>
    </div>
  );
};