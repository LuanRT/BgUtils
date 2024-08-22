import { JSDOM } from 'jsdom';
import { Innertube, UniversalCache, Proto, Utils } from 'youtubei.js';
// Bun:
// import { Innertube, UniversalCache, Proto, Utils } from 'youtubei.js/web';
import { BG } from '../../dist/index.js';

const requestKey = 'O43z0dpjhgX20SCx4KAo';
const visitorData = Proto.encodeVisitorData(Utils.generateRandomString(11), Math.floor(Date.now() / 1000));

const dom = new JSDOM();

globalThis.window = dom.window;
globalThis.document = dom.window.document;

const bgConfig = {
  fetch: (url, options) => fetch(url, options),
  globalObj: globalThis,
  identity: visitorData,
  requestKey,
};

const challenge = await BG.Challenge.create(bgConfig);

if (!challenge)
  throw new Error('Could not get challenge');

if (challenge.script) {
  const script = challenge.script.find((sc) => sc !== null);
  if (script)
    new Function(script)();
} else {
  console.warn('Unable to load Botguard.');
}

const poToken = await BG.PoToken.generate({
  program: challenge.challenge,
  globalName: challenge.globalName,
  bgConfig
});

console.log("Session Info:", {
  visitorData,
  poToken
})

console.log('\n');

const yt = await Innertube.create({
  po_token: poToken,
  visitor_data: visitorData,
  cache: new UniversalCache(),
});

const info = await yt.getBasicInfo('FeqhtDOhX6Y');
const audioStreamingURL = info.chooseFormat({ quality: 'best', type: 'audio' }).decipher(yt.session.player);

console.info("Streaming URL:", audioStreamingURL);