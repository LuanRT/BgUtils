import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';

import Innertube, { Platform, Types, UniversalCache } from 'youtubei.js';

Platform.shim.eval = async (data: Types.BuildScriptResult) => {
    return new Function(data.output)();;
};

const innertube = await Innertube.create({ cache: new UniversalCache(true) });

//#region BotGuard Client Initialization
const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/'
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

const botGuardClient = await BotGuardClient.create({
    program: challengeResponse.bg_challenge.program,
    globalName: challengeResponse.bg_challenge.global_name,
    globalObject: globalThis
});
//#endregion

//#region WebPO Minter Initialization
const requestKey = 'O43z0dpjhgX20SCx4KAo';

const webPoSignalOutput: WebPoSignalOutput = [];
const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

const payload = [requestKey, botguardResponse];

const integrityTokenResponse = await fetch(buildURL('GenerateIT', false), {
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
const videoId = 'kX0k0h_7QV8';

const contentPoToken = await webPoMinter.mintAsWebsafeString(videoId);

const videoInfo = await innertube.getBasicInfo(videoId, { client: 'MWEB' });

const format = videoInfo.chooseFormat({
    quality: 'best',
    type: 'audio'
});

const audioStreamingURL = `${await format.decipher(innertube.session.player)}&pot=${contentPoToken}`;

console.log('Streaming URL:', audioStreamingURL);
//#endregion