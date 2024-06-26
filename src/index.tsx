/* @refresh reload */
import { render } from 'solid-js/web';

import 'virtual:uno.css'
import './index.scss';
import App from './App';
import { initFFmpeg } from './ffmpeg';
import { setupSentry } from './report';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

initFFmpeg()
setupSentry()
render(() => <App />, root!);
