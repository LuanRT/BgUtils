/**
 * This is an alternative way to use the library. It is lower-level, but it
 * allows you to have more control over the process.
 */

import { BG, buildURL, GOOG_API_KEY } from '../../dist/index.js';
import type { WebPoSignalOutput } from '../../dist/index.js';
import { Innertube, UniversalCache } from 'youtubei.js';
import { JSDOM } from 'jsdom';

// Create a barebones Innertube instance so we can get a visitor data string from YouTube.
let innertube = await Innertube.create({ retrieve_player: false });

const requestKey = 'O43z0dpjhgX20SCx4KAo';
const visitorData = innertube.session.context.client.visitorData;

if (!visitorData)
  throw new Error('Could not get visitor data');

const dom = new JSDOM();

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document
});

// #region Fetch challenge
const challengeResponse = await fetch(buildURL('Create', true), {
  method: 'POST',
  headers: {
    'content-type': 'application/json+protobuf',
    'x-goog-api-key': GOOG_API_KEY,
    'x-user-agent': 'grpc-web-javascript/0.1'
  },
  body: JSON.stringify([ requestKey ])
});

const bgChallenge = BG.Challenge.parseChallengeData(await challengeResponse.json());

if (!bgChallenge)
  throw new Error('Could not get challenge');

const interpreterJavascript = bgChallenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;

if (interpreterJavascript) {
  new Function(interpreterJavascript)();
} else throw new Error('Could not load VM');
// #endregion

// #region Generate PoToken
const botguard = await BG.BotGuardClient.create({
  globalName: bgChallenge.globalName,
  globalObj: globalThis,
  program: bgChallenge.program
});

const webPoSignalOutput: WebPoSignalOutput = [];
const botguardResponse = await botguard.snapshot({ webPoSignalOutput });

const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
  method: 'POST',
  headers: {
    'content-type': 'application/json+protobuf',
    'x-goog-api-key': GOOG_API_KEY,
    'x-user-agent': 'grpc-web-javascript/0.1'
  },
  body: JSON.stringify([ requestKey, botguardResponse ])
});

const response = await integrityTokenResponse.json() as unknown[];

if (typeof response[0] !== 'string')
  throw new Error('Could not get integrity token');

const integrityTokenBasedMinter = await BG.WebPoMinter.create({ integrityToken: response[0] }, webPoSignalOutput);
const poToken = await integrityTokenBasedMinter.mintAsWebsafeString(visitorData);
// #endregion

innertube = await Innertube.create({
  po_token: poToken,
  visitor_data: visitorData,
  cache: new UniversalCache(true),
  generate_session_locally: true
});

const info = await innertube.getBasicInfo('FeqhtDOhX6Y');
const audioStreamingURL = info.chooseFormat({
  quality: 'best',
  type: 'audio'
}).decipher(innertube.session.player);

console.info('Visitor data:', visitorData, '\n');
console.info('Session WebPO Token:', poToken, '\n');
console.info('Streaming URL:', audioStreamingURL);