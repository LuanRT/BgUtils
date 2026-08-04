import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { buildURL, parseLooseJSON, getHeaders, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';

import Innertube, { IRawResponse, Platform, Types, UniversalCache } from 'youtubei.js';

Platform.shim.eval = async (data: Types.BuildScriptResult) => new Function(data.output)();

//#region BotGuard Client
const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
  url: 'https://www.youtube.com',
  referrer: 'https://www.youtube.com/',
  userAgent: USER_AGENT,
});

const pageResponse = await fetch('https://www.youtube.com', {
  headers: {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.7",
    "user-agent": USER_AGENT,
  }
});

const pageHtml = await pageResponse.text();

const ytConfig = pageHtml.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
if (!ytConfig) {
  throw new Error('Could not find ytcfg in page HTML');
}

dom.window.yt = { config_: JSON.parse(ytConfig) /* Needed because of EVENT_ID */ };

Object.assign(globalThis, {
  yt: dom.window.yt,
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  origin: dom.window.origin
});

if (!('navigator' in globalThis)) {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
}

const initialAttestationData = pageHtml.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/);

if (!initialAttestationData) {
  throw new Error('Could not find challenge in page HTML');
}

const initialAttestationDataJson = parseLooseJSON(initialAttestationData[1]);
const challengeResponse = initialAttestationDataJson.R as IRawResponse;

if (!challengeResponse.bgChallenge)
  throw new Error('Could not get challenge');

const interpreterUrl = challengeResponse.bgChallenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
const interpreterJavascript = await bgScriptResponse.text();

if (interpreterJavascript) {
  new Function(interpreterJavascript)();
} else throw new Error('Could not load VM');

const botGuardClient = await BotGuardClient.create({
  program: challengeResponse.bgChallenge.program,
  globalName: challengeResponse.bgChallenge.globalName,
  globalObject: globalThis
});
//#endregion

//#region WebPO Minter
const requestKey = 'O43z0dpjhgX20SCx4KAo';

const webPoSignalOutput: WebPoSignalOutput = [];
const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

const payload = [requestKey, botguardResponse];

const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
  method: 'POST',
  headers: getHeaders(),
  body: JSON.stringify(payload)
});

const integrityTokenJson = await integrityTokenResponse.json() as [string, number, number, string];

const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = integrityTokenJson;

const integrityTokenData = {
  integrityToken,
  estimatedTtlSecs,
  mintRefreshThreshold,
  websafeFallbackToken
};

const webPoMinter = await WebPoMinter.create(integrityTokenData, webPoSignalOutput);
//#endregion

//#region Usage Example
const innertube = await Innertube.create({ cache: new UniversalCache(true) });

const videoId = 'kX0k0h_7QV8';
const contentPoToken = await webPoMinter.mintAsWebsafeString(videoId);
const videoInfo = await innertube.getBasicInfo(videoId, { client: 'YTMUSIC' });

const format = videoInfo.chooseFormat({
  quality: 'best',
  type: 'audio'
});

const audioStreamingURL = `${await format.decipher(innertube.session.player)}&pot=${contentPoToken}`;

console.log('\n');
console.log('Content Binding:', videoId);
console.log('WebPO Token:', contentPoToken);
console.log('Streaming URL:', audioStreamingURL);
//#endregion