# Introduction
This library provides tools for generating PO tokens and running attestation challenges, based on reverse-engineering research into how YouTube's web player interacts with BotGuard and Google's Web Anti-Abuse API.

- [Introduction](#introduction)
  - [A Few Notes](#a-few-notes)
  - [Usage](#usage)
  - [Research](#research)
    - [Initialization Process](#initialization-process)
    - [Retrieving Integrity Token](#retrieving-integrity-token)
    - [Minting WebPO Tokens](#minting-webpo-tokens)
    - [When to Use a PO Token](#when-to-use-a-po-token)
      - [Token Types](#token-types)
  - [Sources](#sources)
  - [License](#license)

## A Few Notes

1. BotGuard is a security mechanism used by Google to protect its services from abuse and verify that requests come from real clients. This library provides a reverse-engineered implementation of the process used by YouTube's web player to generate PO Tokens and run attestation challenges. However, **it does not bypass BotGuard**; you still need a runtime environment that meets its checks to use this library.

2. This library is not affiliated with Google or YouTube. I am not responsible for any misuse of this library.

## Usage

Please refer to the provided examples [here](./examples/).

## Research

> NOTE: This is based on personal research and may become outdated as Google updates its services.

### Initialization Process

The interpreter script and its respective bytecode program can be fetched in three different ways:

1. **Directly from a YouTube page**:
    - The (InnerTube) challenge response is usually embedded in the initial page data.
2. **InnerTube API**:
    - InnerTube has an endpoint that can be used to retrieve challenge data. It is the easiest way to do it, as the response is in a readable format.
3. **Web Anti-Abuse Private API**:
    - An internal Google API for BotGuard. It's also used used by services like Google Drive and even Gemini. Responses may be obfuscated depending on the `requestKey`.

WAA challenge fetcher example:

```ts
interface IWebutilHtmlTypesSafeScriptProto {
  privateDoNotAccessOrElseSafeScriptWrappedValue?: string;
};

interface IWebutilHtmlTypesTrustedResourceUrlProto {
  privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string;
};

interface IBotguardClientSideBgChallenge {
  messageId?: string;
  clientExperimentsStateBlob?: string;
  globalName?: string;
  interpreterHash?: string;
  interpreterJavascript?: IWebutilHtmlTypesSafeScriptProto;
  interpreterUrl?: IWebutilHtmlTypesTrustedResourceUrlProto;
  program?: string;
}

async function fetchWaaChallenge(requestKey: string, interpreterHash?: string): Promise<IBotguardClientSideBgChallenge> {
  const payload = [ requestKey ];

  if (interpreterHash)
    payload.push(interpreterHash);
  
  const response = await fetch('https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'x-goog-api-key': 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw',
      'x-user-agent': 'grpc-web-javascript/0.1',
    },
    body: JSON.stringify(payload)
  });

  const rawData = await response.json() as unknown[];

  // The response may be obfuscated. For an example implementation, see src/core/challengeFetcher.ts
  return parseChallengeData(rawData);
};

const challengeResponse = await fetchWaaChallenge('requestKeyHere');

// ...
```

InnerTube challenge fetcher example (for the sake of simplicity, I'll use YouTube.js in this example):
```ts
import { Innertube, UniversalCache } from 'youtubei.js';

const innertube = await Innertube.create({ cache: new UniversalCache(true) });
const challengeResponse = await innertube.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');

if (!challengeResponse.bg_challenge)
  throw new Error('Could not get challenge');

const interpreterUrl = challengeResponse.bg_challenge.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
const interpreterJavascript = await bgScriptResponse.text();

// ...
```

To make the VM available, you need to execute the interpreter script:
```js
if (interpreterJavascript) {
  new Function(interpreterJavascript)();
} else throw new Error('Could not load VM');

// If you're in a browser like environment, you can also do it this way:
if (!document.getElementById(interpreterHash)) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.id = interpreterHash;
  script.textContent = interpreterJavascript;
  document.head.appendChild(script);
}
```

If everything goes well, you should be able to access it like this:
```js
const globalObject = window || globalThis;
const vm = globalObject[globalName];
console.info(vm);
```

### Retrieving Integrity Token

First, you need to load BotGuard, and then give it the bytecode program:

```js
// Assuming you have the VM and its program available in some way...
if (!this.vm)
  throw new Error('EGOU: BotGuard unavailable');

if (!this.vm.a)
  throw new Error('ELIU: BotGuard initialization function unavailable');

const vmSetupCallback = (
  asyncSnapshotFunction,
  shutdownFunction,
  passEventFunction,
  checkCameraFunction
) => {
  Object.assign(this.vmFunctions, { asyncSnapshotFunction, shutdownFunction, passEventFunction, checkCameraFunction });
};

try {
  this.syncSnapshotFunction = await this.vm.a(
    this.program,
    vmSetupCallback,
    true,
    undefined /* userInteractionElement */,
    () => {} /* vmTelemetryCallback (reports to Google Clearcut) */,
    [[], []] /* experiments */,
    undefined,
    false,
    undefined /* loggerFunctions */
  )?.[0];
} catch (error) {
  throw new Error('Could not load program');
}
```

Then, BotGuard will return several callback functions, but we are mainly interested in `asyncSnapshotFunction`.

Once `asyncSnapshotFunction` is available, call it with the following arguments:
1. A callback function that takes a single argument. This function will return the token for the WAA (Web Anti-Abuse) API call.
2. An array with four elements:
    - 1st: `contentBinding` (Optional).
    - 2nd: `signedTimestamp` (Optional).
    - 3rd: `webPoSignalOutput` (Required for our use case. BotGuard will return a function to get a WebPO minter here).
    - 4th: `skipPrivacyBuffer` (Optional).

Example:
```js
async function snapshot(args) {
  return new Promise((resolve, reject) => {
    if (!this.vmFunctions.asyncSnapshotFunction)
      return reject(new Error('Async snapshot function not found'));

    this.vmFunctions.asyncSnapshotFunction((response) => resolve(response), [
      args.contentBinding,
      args.signedTimestamp,
      args.webPoSignalOutput,
      args.skipPrivacyBuffer
    ]);
  });
}
```

Then:
```js
const webPoSignalOutput = [];
const botguardResponse = await snapshot({ webPoSignalOutput });
```

At this point, a successful run will give you a (quite long) token and an array containing one or more functions.

Now we can create a proper payload for the integrity token request. It should be an array of two items: the request key and the BotGuard response.

Example:
```ts
type PoIntegrityTokenResponse = {
  integrityToken?: string;
  estimatedTtlSecs: number;
  mintRefreshThreshold: number;
  websafeFallbackToken?: string;
};

/**
 * Creates an integrity token for use in PO Tokens (Proof of Origin).
 * @param requestKey - The request key.
 * @param botguardResponse - A valid BotGuard response.
 */
async function getPoIntegrityToken(requestKey: string, botguardResponse: string): Promise<PoIntegrityTokenResponse> {
  const payload = [ requestKey, botguardResponse ];

  const integrityTokenResponse = await fetch('https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'x-goog-api-key': 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw',
      'x-user-agent': 'grpc-web-javascript/0.1',
    },
    body: JSON.stringify(payload)
  });

  const integrityTokenJson = await integrityTokenResponse.json() as [string, number, number, string];

  const [ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken ] = integrityTokenJson;

  return {
    integrityToken,
    estimatedTtlSecs,
    mintRefreshThreshold,
    websafeFallbackToken
  };
}

const integrityTokenResponse = await getPoIntegrityToken('requestKeyHere', botguardResponse);
```

Store the integrity token response and the array obtained earlier, they're needed to mint PO tokens.

### Minting WebPO Tokens

Call the first function in the `webPoSignalOutput` array with the Integrity Token (in bytes) as an argument:

```js
const getMinter = webPoSignalOutput[0];

if (!getMinter)
  throw new Error('PMD:Undefined');

const mintCallback = await getMinter(base64ToU8(integrityTokenResponse.integrityToken ?? ''));

if (!(mintCallback instanceof Function))
  throw new Error('APF:Failed');
```

If successful, you'll have a function that can be used to mint WebPO tokens. Call it with the value you want to use as content binding, such as a Visitor ID, Data Sync ID, or a Video ID:
```js
const result = await mintCallback(new TextEncoder().encode(identifier));

if (!result)
  throw new Error('YNJ:Undefined');

if (!(result instanceof Uint8Array))
  throw new Error('ODM:Invalid');

const poToken = u8ToBase64(result, true);
console.info(poToken);
```

The result will be a sequence of bytes, about 110–128 bytes in length. Base64 encode it, and you'll have a PO Token!

### When to Use a PO Token

On web, YouTube mints a new PO token for each video request, using the video ID as the content binding. It also mints a cold start token so playback can begin before BotGuard initialization and token minting are fully ready. Also, YouTube reuses the same minter for as long as the page is open.

The player also checks a value called "sps" (`StreamProtectionStatus`), included in every UMP response, to determine if the stream needs a PO Token.

- **Status "1"**: The stream is already using a valid PO token, the account has Premium access, or the stream does not require PO tokens.
- **Status "2"**: A PO token is required, but the client can still request up to 1-2 MB of data before playback is interrupted using a cold start token. The client should request a "real" PO token as soon as possible.
- **Status "3"**: The client cannot continue fetching media data without a valid PO token.

#### Token Types

- **Cold start token**: A placeholder token used to start playback before BotGuard or the minter is ready. It is encrypted using a simple XOR cipher, and should use the same content binding as the real token.
- **Session bound token**: Generated when the user interacts with the player. If logged in, it is bound to the account's Data Sync ID, otherwise, a Visitor ID is used. NOTE: YouTube's web client does not use this token type anymore. As far as I am aware, only YouTube Music (`WEB_REMIX`) still does.
- **Content bound token**: Generated for each video request, using the video ID as the content binding.

## Sources
Most of this research comes from inspecting YouTube's minified JavaScript and tracing behavior manually. I also look at older versions when possible, since they are often easier to read (less obfuscation!). And lastly, I used the now-deleted WAA discovery document as a reference for a few minor things, along with the (also now-deleted) DroidGuard discovery document, which was very similar to WAA when it comes to PO tokens.

1. https://deviceintegritytokens-pa.googleapis.com/$discovery/rest?alt=json&key=AIzaSyBtL0AK6Hzgr69rQyeyhi-V1lmtsPGZd1M (gone)
2. https://jnn-pa.googleapis.com/$discovery/rest?alt=json&key=AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw (gone)
3. https://www.youtube.com/s/desktop/4965577f/jsbin/desktop_polymer.vflset/desktop_polymer.js (early 2023; first signs of a proper BotGuard client implementation, but no WebPO client).
4. https://www.youtube.com/s/desktop/d5c4364e/jsbin/desktop_polymer.vflset/desktop_polymer.js (late 2023; complete BotGuard client implementation, including WebPO support).
5. Many other YouTube JS bundles that I didn't bookmark...

## License

Distributed under the [MIT](https://choosealicense.com/licenses/mit/) License.

<p align="right">
(<a href="#top">back to top</a>)
</p>
