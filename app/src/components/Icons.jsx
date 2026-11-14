// Inline SVG icons. Riddle icons (ids from content/SCHEMA.md) are drawn simply and colourfully on a 48×48 grid with
// one consistent outline weight; UI icons use currentColor.
const O = '#3a2d4f'; // outline ink
const sw = 2.2;

const RIDDLE = {
  flower: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round">
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse cx="24" cy="13" rx="7" ry="9" fill="#ff8fb8" transform={`rotate(${a} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="6.5" fill="#ffd34d" />
    </g>
  ),
  star: (
    <path d="M24 4.5l5.9 12.1 13.3 1.9-9.6 9.3 2.3 13.2L24 34.8 12.1 41l2.3-13.2-9.6-9.3 13.3-1.9z" fill="#ffcc33" stroke={O} stroke-width={sw} stroke-linejoin="round" />
  ),
  gem: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round">
      <path d="M13 8h22l9 11-20 22L4 19z" fill="#5fd0e8" />
      <path d="M4 19h40M17 8l-4 11 11 22 11-22-4-11" fill="none" />
    </g>
  ),
  key: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round" stroke-linecap="round">
      <circle cx="15" cy="24" r="9" fill="#ffc34d" />
      <circle cx="15" cy="24" r="3.2" fill="#fff6e0" />
      <path d="M24 24h19M37 24v7M42 24v5" fill="none" stroke-width="4.4" stroke="#3a2d4f" />
      <path d="M24 24h19M37 24v7M42 24v5" fill="none" stroke-width="2" stroke="#ffc34d" />
    </g>
  ),
  house: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round">
      <path d="M9 22v20h30V22" fill="#ffe2b8" />
      <path d="M4 24L24 6l20 18" fill="#ff7a5c" />
      <rect x="20" y="29" width="8" height="13" rx="1.5" fill="#8b5cf6" />
    </g>
  ),
  car: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round">
      <path d="M5 30v-6l5-2 5-8h16l6 8 6 2v6z" fill="#4f9cf0" />
      <path d="M17 15h6v7h-10zM26 15h4l5 7h-9z" fill="#dff3ff" />
      <circle cx="14" cy="32" r="5" fill="#3a2d4f" />
      <circle cx="35" cy="32" r="5" fill="#3a2d4f" />
      <circle cx="14" cy="32" r="1.8" fill="#fff" stroke="none" />
      <circle cx="35" cy="32" r="1.8" fill="#fff" stroke="none" />
    </g>
  ),
  sun: (
    <g stroke={O} stroke-width={sw} stroke-linecap="round">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path d="M24 3v6" transform={`rotate(${a} 24 24)`} stroke="#ff9f1c" stroke-width="3.2" />
      ))}
      <circle cx="24" cy="24" r="11" fill="#ffd23f" />
    </g>
  ),
  apple: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round" stroke-linecap="round">
      <path d="M24 15c-4-4-17-4-17 10 0 9 7 18 12 18 2.5 0 3.5-1.3 5-1.3s2.5 1.3 5 1.3c5 0 12-9 12-18 0-14-13-14-17-10z" fill="#ff5a5f" />
      <path d="M24 15c0-4 1-7 3-9" fill="none" />
      <path d="M27 9c3-4 8-4 10-3-2 4-6 5-10 3z" fill="#5cc96b" />
    </g>
  ),
  heart: (
    <path d="M24 41S6 30 6 17.5C6 11 11 7 16 7c3.8 0 6.6 2.2 8 5 1.4-2.8 4.2-5 8-5 5 0 10 4 10 10.5C42 30 24 41 24 41z" fill="#ff6b9a" stroke={O} stroke-width={sw} stroke-linejoin="round" />
  ),
  moon: (
    <path d="M30 5a18 18 0 1 0 13 28A15 15 0 0 1 30 5z" fill="#ffe066" stroke={O} stroke-width={sw} stroke-linejoin="round" />
  ),
  ball: (
    // beach ball: three coloured segments
    <g stroke={O} stroke-width={sw} stroke-linejoin="round">
      <circle cx="24" cy="24" r="18" fill="#fff" />
      <path d="M24 6c-7 5-9 12-9 18s2 13 9 18c-10 0-18-8-18-18S14 6 24 6z" fill="#ff5a5f" />
      <path d="M24 6c7 5 9 12 9 18s-2 13-9 18c10 0 18-8 18-18S34 6 24 6z" fill="#4f9cf0" />
      <path d="M24 6c-7 5-9 12-9 18s2 13 9 18M24 6c7 5 9 12 9 18s-2 13-9 18" fill="none" />
    </g>
  ),
  fish: (
    <g stroke={O} stroke-width={sw} stroke-linejoin="round">
      <path d="M38 24c-4-8-11-12-19-12C11 12 5 18 4 24c1 6 7 12 15 12 8 0 15-4 19-12z" fill="#ff9f43" />
      <path d="M38 24l7-8v16z" fill="#ff9f43" />
      <circle cx="12" cy="22" r="2.2" fill={O} stroke="none" />
      <path d="M22 16c3 3 3 13 0 16" fill="none" />
    </g>
  ),
};

export function RiddleIcon({ id, size = 56, title }) {
  return (
    <svg class="ricon" viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={title || id}>
      {RIDDLE[id] || <circle cx="24" cy="24" r="18" fill="#ddd" />}
    </svg>
  );
}

// Shapes that hide a digit in "shape-digit" riddles (1△ + 1△ = 28).
export function Shape({ shape, size = '1em', fill = '#ffd84d' }) {
  const p = { fill, stroke: O, 'stroke-width': 3, 'stroke-linejoin': 'round' };
  return (
    <svg class="shape" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {shape === 'triangle' && <path d="M20 4L37 35H3z" {...p} />}
      {shape === 'square' && <rect x="5" y="5" width="30" height="30" rx="4" {...p} />}
      {shape === 'circle' && <circle cx="20" cy="20" r="16" {...p} />}
    </svg>
  );
}

// Island + UI icons (currentColor, rounded strokes).
const UI = {
  book: <path d="M6 10c6-2 12-2 18 2 6-4 12-4 18-2v26c-6-2-12-2-18 2-6-4-12-4-18-2zM24 12v26" />,
  plus: <path d="M24 9v30M9 24h30" />,
  blank: (
    <g>
      <rect x="8" y="14" width="32" height="20" rx="5" stroke-dasharray="5 4" />
      <path d="M21 20c0-2 1.5-3 3-3s3 1 3 2.8c0 2.6-3 2.6-3 5M24 30v.5" />
    </g>
  ),
  bubble: <path d="M8 12h32v20H22l-8 7v-7H8z" />,
  shapes: (
    <g>
      <path d="M14 8l9 15H5z" />
      <rect x="27" y="8" width="14" height="14" rx="2" />
      <circle cx="24" cy="34" r="7" />
    </g>
  ),
  gift: (
    <g>
      <rect x="8" y="20" width="32" height="20" rx="3" />
      <path d="M6 14h36v6H6zM24 14v26M24 14c-3-6-11-7-11-2 0 3 6 2 11 2 5 0 11 1 11-2 0-5-8-4-11 2" />
    </g>
  ),
  flag: <path d="M12 42V7M12 8h22l-5 7 5 7H12" />,
  lock: (
    <g>
      <rect x="11" y="21" width="26" height="19" rx="4" />
      <path d="M16 21v-5a8 8 0 0 1 16 0v5" />
    </g>
  ),
  back: <path d="M18 12l12 12-12 12" />, // RTL "back" points right
  close: <path d="M13 13l22 22M35 13L13 35" />,
  backspace: (
    <g>
      <path d="M17 12h22a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H17L6 24z" />
      <path d="M24 19l10 10M34 19L24 29" />
    </g>
  ),
  swap: <path d="M10 17h26l-6-6M38 31H12l6 6" />,
  passage: <path d="M10 8h28v32H10zM16 16h16M16 23h16M16 30h10" />,
  question: <path d="M17 17c0-4 3-7 7-7s7 3 7 7c0 6-7 6-7 12M24 37v1" />,
  check: <path d="M10 25l9 9 19-20" />,
  gear: (
    <g>
      <circle cx="24" cy="24" r="6.5" />
      <path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5" />
      <circle cx="24" cy="24" r="12" />
    </g>
  ),
  bulb: <path d="M18 34h12M19 40h10M24 6a12 12 0 0 0-7 21.7c1 .8 1 2 1 3.3h12c0-1.3 0-2.5 1-3.3A12 12 0 0 0 24 6z" />,
  // T5: album, games, streak, timer, trophy, magnifier
  album: (
    <g>
      <path d="M10 7h24a4 4 0 0 1 4 4v30H14a4 4 0 0 1-4-4z" />
      <path d="M10 37a4 4 0 0 1 4-4h24" />
      <path d="M24 13.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" />
    </g>
  ),
  games: (
    <g>
      <path d="M15 14h18a10 10 0 0 1 10 10v4a6 6 0 0 1-11 3.3L30 29H18l-2 2.3A6 6 0 0 1 5 28v-4a10 10 0 0 1 10-10z" />
      <path d="M15 20v8M11 24h8M33 21v.5M37 25v.5" />
    </g>
  ),
  flame: <path d="M24 42c-8 0-13-5-13-12 0-8 7-11 8-19 5 3 7 8 7 12 2-1 3-4 3-6 4 3 8 8 8 13 0 7-5 12-13 12zM24 42c-3 0-5-2-5-5 0-4 5-6 5-10 3 3 5 6 5 10 0 3-2 5-5 5z" />,
  timer: (
    <g>
      <circle cx="24" cy="27" r="15" />
      <path d="M24 27v-8M19 6h10M24 6v6" />
    </g>
  ),
  trophy: <path d="M15 8h18v8a9 9 0 0 1-18 0zM15 11H8c0 6 3 9 8 9M33 11h7c0 6-3 9-8 9M24 25v8M16 40h16M19 33h10v7H19z" />,
  search: (
    <g>
      <circle cx="21" cy="21" r="12" />
      <path d="M30 30l10 10" />
    </g>
  ),
};

export function UiIcon({ id, size = 28, stroke = 3.4 }) {
  return (
    <svg class="uicon" viewBox="0 0 48 48" width={size} height={size} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {UI[id]}
    </svg>
  );
}

export function StarIcon({ size = 28, filled = true }) {
  return (
    <svg class="staricon" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path
        d="M24 4.5l5.9 12.1 13.3 1.9-9.6 9.3 2.3 13.2L24 34.8 12.1 41l2.3-13.2-9.6-9.3 13.3-1.9z"
        fill={filled ? '#ffc933' : '#efe6d6'}
        stroke={filled ? '#d99a00' : '#d8ccb8'}
        stroke-width="2.4"
        stroke-linejoin="round"
      />
    </svg>
  );
}
