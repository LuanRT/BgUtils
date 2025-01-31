# Introduction
This library provides tools for generating PO Tokens and executing attestation challenges, reverse-engineering how YouTube’s web player interacts with BotGuard and the Web Anti-Abuse API.

- [Introduction](#introduction)
  - [A Few Notes](#a-few-notes)
  - [Usage](#usage)
  - [Research](#research)
    - [Initialization Process](#initialization-process)
    - [Retrieving Integrity Token](#retrieving-integrity-token)
    - [Minting WebPO Tokens](#minting-webpo-tokens)
    - [When to Use a PO Token](#when-to-use-a-po-token)
  - [License](#license)

## A Few Notes

1. BotGuard is a security mechanism used by Google to protect its services from abuse and verify that requests originate from legitimate clients. This library provides a reverse-engineered implementation of the process used by YouTube's web player to generate PO Tokens and run attestation challenges. However, **it does not bypass BotGuard**; you still need a compliant environment that meets its checks to use this library.

2. This library is intended for educational purposes and is not affiliated with Google or YouTube. I am not responsible for any misuse of this library.

## Usage

Please refer to the provided examples [here](./examples/).

## Research

Here’s a brief overview of the process for generating a PO Token, for those curious about the library’s inner workings. This information is based on my own research and may become outdated as Google updates its security mechanisms.

### Initialization Process

The VM's script and respective bytecode program can be fetched in three different ways:

1. **Directly from the page's source code**:
    - The (InnerTube) challenge response is usually embedded in the initial page's source code.
2. **InnerTube API**:
    - InnerTube has an endpoint that can be used to retrieve challenge data. It is usually the easiest way to do so, as the response is in a readable format.
3. **Web Anti-Abuse Private API**:
    - An internal Google API for BotGuard, also used by services like Google Drive. Responses may be obfuscated depending on the `requestKey`.

WAA challenge fetcher example:

```ts
type TrustedResource = {
  privateDoNotAccessOrElseSafeScriptWrappedValue: string | null;
  privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: string | null;
}

type DescrambledChallenge = {
  /**
   * The ID of the JSPB message.
   */
  messageId?: string;
  /**
   * The script associated with the challenge.
   */
  interpreterJavascript: TrustedResource;
  /**
   * The hash of the script. Useful if you want to fetch the challenge script again at a later time.
  */
  interpreterHash: string;
  /**
   * The challenge program.
   */
  program: string;
  /**
   * The name of the VM in the global scope.
  */
  globalName: string;
  /**
   * The client experiments state blob.
  */
  clientExperimentsStateBlob?: string;
};

async function fetchWaaChallenge(requestKey: string, interpreterHash?: string): Promise<DescrambledChallenge | undefined> {
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

To make the VM available, you need to execute the script in some way:
```js
if (interpreterJavascript) {
  new Function(interpreterJavascript)();
} else throw new Error('Could not load VM');

// If you're in a browser-like environment, you can also use the following:
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

This is an important step, the integrity token is retrieved from an attestation server and relies on the BotGuard response, likely to assess the integrity of the runtime environment. To solve this challenge, you need to invoke BotGuard and load the bytecode program.

```js
// Assuming you have the VM and the program available in some way.
if (!this.vm)
  throw new Error('[BotGuardClient] VM not found in the global object');

if (!this.vm.a)
  throw new Error('[BotGuardClient] Cannot load program');

const vmFunctionsCallback = (
  asyncSnapshotFunction,
  shutdownFunction,
  passEventFunction,
  checkCameraFunction
) => {
  Object.assign(this.vmFunctions, { asyncSnapshotFunction, shutdownFunction, passEventFunction, checkCameraFunction });
};

try {
  this.syncSnapshotFunction = await this.vm.a(this.program, vmFunctionsCallback, true, undefined, () => { /** no-op */ }, [ [], [] ])[0];
} catch (error) {
  throw new Error(`[BotGuardClient] Failed to load program (${(error as Error).message})`);
}
```

Here, BotGuard will return several functions, but we are mainly interested in `asyncSnapshotFunction`.

Once `asyncSnapshotFunction` is available, call it with the following arguments:
1. A callback function that takes a single argument. This function will return the token for the attestation request.
2. An array with four elements:
    - 1st: `contentBinding` (Optional).
    - 2nd: `signedTimestamp` (Optional).
    - 3rd: `webPoSignalOutput` (Optional but required for our case, BotGuard will fill this array with a function to get a WebPO minter).
    - 4th: `skipPrivacyBuffer` (Optional).

Here's a simplified example:
```js
async function snapshot(args) {
  return new Promise((resolve, reject) => {
    if (!this.vmFunctions.asyncSnapshotFunction)
      return reject(new Error('[BotGuardClient]: Async snapshot function not found'));

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

If everything was done correctly so far, you should have a token and an array with one or more functions.

Now we can create the payload for the integrity token request. It should be an array of two items: the request key and the token.

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

Store the integrity token response and the array we obtained earlier. We'll use them to construct our WebPO Token.

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
If successful, you'll get a function that can be used to mint WebPO tokens. Call it with the value you want to use as content binding, such as a Visitor ID, Data Sync ID (if you're signed in), or a Video ID.
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

On web, YouTube tries to mint a session bound PO Token as soon as the user interacts with the player, a cold start token is also minted to ensure playback starts without delays. Once minted, the PO Token is then reused for the rest of the session. If the user refreshes the page, the cached token is used (if available, otherwise a cold start token is used) until a new one finishes minting, and if that fails for some reason, the player will continue using the cached token as long as its respective integrity token is still valid.

The player also checks a value called "sps" (`StreamProtectionStatus`), included in each media segment response (only if using `UMP` or `SABR`; our browser example uses `UMP`) to determine if the stream needs a PO Token.

- **Status 1**: The stream is already using a valid PO Token, the user has a YouTube Premium subscription, or the stream does not require PO Tokens.
- **Status 2**: A PO Token is required, but the client can request up to 1-2 MB of data before playback is interrupted.
- **Status 3**: At this stage, the player can no longer request data without a PO Token.

#### Token Types

- **Cold start token**: A placeholder token used to start playback before the session-bound token is minted. It is encrypted using a simple XOR cipher, and uses the Data Sync ID or Visitor ID as the content binding.
- **Session bound token**: Generated when the user interacts with the player. If logged in, it is bound to the account's Data Sync ID, otherwise, a Visitor ID is used.
- **Content bound token**: Generated for every `/player` request (`serviceIntegrityDimensions.poToken`). It is bound to the Video ID and should not be cached.

## License

Distributed under the [MIT](https://choosealicense.com/licenses/mit/) License.

<p align="right">
(<a href="#top">back to top</a>)
</p>
