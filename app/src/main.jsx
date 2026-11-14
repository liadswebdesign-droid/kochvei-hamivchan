import { render } from 'preact';
import './fonts.css';
import './styles.css';
import { App } from './App.jsx';

render(<App />, document.getElementById('app'));

// Service worker (vite-plugin-pwa, generateSW). Production only; dev serves without one.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
