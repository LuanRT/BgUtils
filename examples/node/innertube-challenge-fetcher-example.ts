import type { WebPoSignalOutput } from '../../dist/index.js';
import { BG, buildURL, GOOG_API_KEY, USER_AGENT } from '../../dist/index.js';
import { Innertube, YT, YTNodes } from 'youtubei.js';
import { JSDOM } from 'jsdom';

const userAgent = USER_AGENT;

// @NOTE: Session cache is disabled so we can get a fresh visitor data string.
const innertube = await Innertube.create({ user_agent: userAgent, enable_session_cache: false });
const visitorData = innertube.session.context.client.visitorData || '';

// #region BotGuard Initialization
const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
  url: 'https://www.youtube.com/',
  referrer: 'https://www.youtube.com/',
  userAgent
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  origin: dom.window.origin
});

if (!Reflect.has(globalThis, 'navigator')) {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
}

const challengeResponse = await innertube.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');

if (!challengeResponse.bg_challenge)
  throw new Error('Could not get challenge');

const interpreterUrl = challengeResponse.bg_challenge.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
const interpreterJavascript = await bgScriptResponse.text();

if (interpreterJavascript) {
  new Function(interpreterJavascript)();
} else throw new Error('Could not load VM');

const botguard = await BG.BotGuardClient.create({
  program: challengeResponse.bg_challenge.program,
  globalName: challengeResponse.bg_challenge.global_name,
  globalObj: globalThis
});
// #endregion

// #region WebPO Token Generation
const webPoSignalOutput: WebPoSignalOutput = [];
const botguardResponse = await botguard.snapshot({ webPoSignalOutput });
const requestKey = 'O43z0dpjhgX20SCx4KAo';

const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
  method: 'POST',
  headers: {
    'content-type': 'application/json+protobuf',
    'x-goog-api-key': GOOG_API_KEY,
    'x-user-agent': 'grpc-web-javascript/0.1',
    'user-agent': userAgent
  },
  body: JSON.stringify([ requestKey, botguardResponse ])
});

const response = await integrityTokenResponse.json() as unknown[];

if (typeof response[0] !== 'string')
  throw new Error('Could not get integrity token');

const integrityTokenBasedMinter = await BG.WebPoMinter.create({ integrityToken: response[0] }, webPoSignalOutput);
// #endregion

// #region YouTube.js Usage Example
const videoId = '7eLARwNIjDY';

const contentPoToken = await integrityTokenBasedMinter.mintAsWebsafeString(videoId);
const sessionPoToken = await integrityTokenBasedMinter.mintAsWebsafeString(visitorData);

const watchEndpoint = new YTNodes.NavigationEndpoint({ watchEndpoint: { videoId } });

const extraRequestArgs = {
  playbackContext: {
    contentPlaybackContext: {
      vis: 0,
      splay: false,
      lactMilliseconds: '-1',
      signatureTimestamp: innertube.session.player?.sts
    }
  },
  serviceIntegrityDimensions: {
    poToken: contentPoToken
  }
};

const watchResponse = await watchEndpoint.call(innertube.actions, extraRequestArgs);
const videoInfo = new YT.VideoInfo([ watchResponse ], innertube.actions, '');

const audioStreamingURL = `${videoInfo.chooseFormat({
  quality: 'best',
  type: 'audio'
}).decipher(innertube.session.player)}&pot=${sessionPoToken}`;

console.info('Visitor data:', decodeURIComponent(visitorData));
console.info('Content WebPO Token:', contentPoToken);
console.info('Session WebPO Token:', sessionPoToken);
console.info('Cold Start WebPO Token:', BG.PoToken.generateColdStartToken(visitorData), '\n');
console.info('Streaming URL:', audioStreamingURL);
// #endregion