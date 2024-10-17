import { GOOG_BASE_URL, YT_BASE_URL } from './constants.js';

const base64urlCharRegex = /[-_.]/g;

const base64urlToBase64Map = {
  '-': '+',
  _: '/',
  '.': '='
};

export function base64ToU8(base64: string): Uint8Array {
  let base64Mod;

  if (base64urlCharRegex.test(base64)) {
    base64Mod = base64.replace(base64urlCharRegex, function (match) {
      return base64urlToBase64Map[match as keyof typeof base64urlToBase64Map];
    });
  } else {
    base64Mod = base64;
  }

  base64Mod = atob(base64Mod);

  const result = new Uint8Array(
    [ ...base64Mod ].map(
      (char) => char.charCodeAt(0)
    )
  );

  return result;
}

export function u8ToBase64(u8: Uint8Array, base64url = false): string {
  const result = btoa(String.fromCharCode(...u8));

  if (base64url) {
    return result
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  return result;
}

export function buildURL(endpointName: string, useYouTubeAPI?: boolean): string {
  return `${useYouTubeAPI ? YT_BASE_URL : GOOG_BASE_URL}/${useYouTubeAPI ? 'api/jnn/v1' : '$rpc/google.internal.waa.v1.Waa'}/${endpointName}`;
} 