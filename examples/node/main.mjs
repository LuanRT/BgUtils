import { JSDOM } from 'jsdom';
import { Innertube, UniversalCache, Proto, Utils } from 'youtubei.js';
import { BG } from '../../src/index.mjs';

const bgClientId = 'O43z0dpjhgX20SCx4KAo';
const visitorData = Proto.encodeVisitorData(Utils.generateRandomString(11), Math.floor(Date.now() / 1000));

const dom = new JSDOM();

globalThis.window = dom.window;
globalThis.document = dom.window.document;

const bgConfig = {
  fetch: (url, options) => fetch(url, options),
  globalObj: globalThis,
  clientId: bgClientId,
  visitorData,
};

const challenge = await BG.Challenge.get(bgConfig);

if (challenge) {
  new Function(challenge.script.find((sc) => sc !== null))();

  const poToken = await BG.PoToken.create({
    program: challenge.challenge,
    vmName: challenge.vmName,
    bgConfig
  });

  console.info("PoToken:", poToken);
  console.info("VisitorData:", visitorData);

  console.log('\n');
  console.log("Fetching audio streaming URL...");
  console.log('\n');

  const yt = await Innertube.create({
    po_token: poToken,
    visitor_data: visitorData,
    cache: new UniversalCache(),
  });

  const info = await yt.getBasicInfo('5tv1sn-TAWM');
  const audioStreamingURL = info.chooseFormat({ quality: 'best', type: 'audio' }).decipher(yt.session.player);

  console.info("Streaming URL:", audioStreamingURL);
}