import { render } from 'preact';
import './fonts.css';
import './styles.css';
import './fun.css'; // T5: companions, album, celebrations, mini-games
import { App } from './App.jsx';
import { initSound } from './lib/sound.js';
import { initServiceWorker } from './lib/swUpdate.js';

initSound(); // T5: unlock WebAudio on the first touch; soft tap sound on buttons

render(<App />, document.getElementById('app'));

// Service worker (vite-plugin-pwa, generateSW). Production only; dev serves without one. Update flow: lib/swUpdate.js.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  initServiceWorker(import.meta.env.BASE_URL + 'sw.js', import.meta.env.BASE_URL);
}
