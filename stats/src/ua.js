// A coarse device label from the User-Agent, e.g. "Android tablet · Chrome". The raw UA is never stored.
//
// iPadOS Safari sends a Mac User-Agent by default ("desktop-class browsing"), so the server cannot tell an iPad from
// a Mac: both read "iPad/Mac · Safari".

function os(ua) {
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

function browser(ua) {
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/EdgiOS\/|EdgA\/|Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|OPiOS\//.test(ua)) return 'Opera';
  if (/FxiOS\/|Firefox\//.test(ua)) return 'Firefox';
  if (/CriOS\/|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}

// `touch`: the app reports whether the screen is a touch screen. Chrome on a big Android tablet asks for the desktop
// site by default and then sends a Linux desktop User-Agent; Linux + touch is that tablet.
export function deviceKind(ua, touch = null) {
  if (typeof ua !== 'string' || !ua) return 'Unknown';
  let o = os(ua);
  if (o === 'Linux' && touch === true) o = 'Android tablet';
  const b = browser(ua);
  if (o === 'Mac' && b === 'Safari') o = 'iPad/Mac';
  if (!o && !b) return 'Other';
  return [o || 'Other', b || 'Other browser'].join(' · ');
}
