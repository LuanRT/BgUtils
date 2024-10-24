# What Is This?
This library facilitates the creation of PoTokens by directly interacting with BotGuard's API.


- [What Is This?](#what-is-this)
  - [A Few Notes](#a-few-notes)
  - [Usage](#usage)
  - [Research](#research)
    - [Initialization Process](#initialization-process)
    - [Retrieving Integrity Token](#retrieving-integrity-token)
    - [Minting WebPo Tokens](#minting-webpo-tokens)
    - [When to Use a PoToken](#when-to-use-a-potoken)
  - [License](#license)

## A Few Notes

1. This library does not bypass BotGuard; **you still need** an environment that passes its checks to use it. It is simply a reverse-engineered implementation of the same process that YouTube’s web player uses.

2. The library is not affiliated with Google or YouTube in any way. It is an independent project created for educational purposes. I am not responsible for any misuse of this library.

## Usage

Please refer to the provided examples [here](./examples/).

## Research

Below is a brief overview of the process to generate a PoToken for those interested in the inner workings of the library. This information is based on my own research and may become outdated as Google updates its systems.

### Initialization Process

First, retrieve the VM's script and program:
```shell
curl --request POST \
  --url 'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create' \
  --header 'Content-Type: application/json+protobuf' \
  --header 'x-goog-api-key: AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw' \
  --header 'x-user-agent: grpc-web-javascript/0.1' \
  --data '[ "requestKeyHere" ]'
```

Once the response data is available, it must be descrambled and parsed:
```js
// ...
const buffer = base64ToU8(scrambledChallenge);
const descrambled = new TextDecoder().decode(buffer.map((b) => b + 97));
const challengeData = JSON.parse(descrambled);
```

The descrambled data should consist of a message ID, the interpreter JavaScript, the interpreter hash, a program, and the script's global name.

To make the VM available, evaluate the script: 
```js
const interpreterJavascript = bgChallenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;

if (interpreterJavascript) {
    new Function(interpreterJavascript)();
} else throw new Error('Could not load VM');
```

If everything goes well, you should be able to access it like so:
```js
const globalObject = window || globalThis;
console.log(globalObject[challengeData.globalName]);
```

### Retrieving Integrity Token

This is a crucial step. The Integrity Token is retrieved from an attestation server and relies on the result of the BotGuard challenge, likely to assess the integrity of the runtime environment. To "solve" this challenge, you need to invoke BotGuard and pass the retrieved program as its first argument.

```js
// ...
if (!this.vm)
  throw new Error('[BotGuardClient]: VM not found in the global object');

if (!this.vm.a)
  throw new Error('[BotGuardClient]: Could not load program');

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
  throw new Error(`[BotGuardClient]: Failed to load program (${(error as Error).message})`);
}
```

The second parameter should be a callback function, where BotGuard will return several functions. In our case, we are mainly interested in `asyncSnapshotFunction`.

Once `asyncSnapshotFunction` is available, call it with the following arguments:
1. A callback function that takes a single argument. This function will return the token for the attestation request.
2. An array with four elements:
    - 1st: `contentBinding` (Optional).
    - 2nd: `signedTimestamp` (Optional).
    - 3rd: `webPoSignalOutput` (Optional but required for our case, BotGuard will fill this array with a function to get a PoToken minter).
    - 4th: `skipPrivacyBuffer` (Optional, not sure what this one is/does).

```js
async snapshot(args) {
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

If everything was done correctly, you should have a token and an array with one or more functions.

Now we can create the payload for the Integrity Token request. It should be an array of two items: the request key and the token.

```shell
curl --request POST \
  --url 'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json+protobuf' \
  --header 'x-goog-api-key: AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw' \
  --header 'x-user-agent: grpc-web-javascript/0.1' \
  --data '[ "requestKeyHere", "$abcdeyourbotguardtokenhere" ]'
```

If the API call is successful, you will receive a JSPB (json+protobuf) response that looks like this:
```json
[
  "azXvdvYQKz8ff4h9PjIlQI7JUOTtYnBdXEGs4bmQb8FvmFB+oosILg6flcoDfzFpwas/hitYcUzx3Qm+DFtQ9slN",
  43200,
  100,
]
```

The first item is the Integrity Token, the second is the TTL (Time to Live), and the third is the refresh threshold.

Store the token and the array we obtained earlier. We'll use them to construct the PoToken.

### Minting WebPo Tokens

Call the first function in the `webPoSignalOutput` array with the Integrity Token (in bytes) as an argument:

```js
const getMinter = webPoSignalOutput[0];

if (!getMinter)
  throw new Error('PMD:Undefined');

const mintCallback = await getMinter(base64ToU8(integrityTokenResponse.integrityToken ?? ''));

if (!(mintCallback instanceof Function))
  throw new Error('APF:Failed');
```

If successful, you'll receive a function to mint PoTokens. Call it with your Visitor ID (or Data Sync ID if you're signed in) as an argument:
```js
const result = await mintCallback(new TextEncoder().encode(identifier));

if (!result)
  throw new Error('YNJ:Undefined');

if (!(result instanceof Uint8Array))
  throw new Error('ODM:Invalid');

const poToken = u8ToBase64(result, true);
console.log(poToken);
```

The result will be a sequence of bytes, about 110–128 bytes in length. Base64 encode it, and you'll have a PoToken!

### When to Use a PoToken

YouTube's web player checks the "sps" (`StreamProtectionStatus`) of each media segment request (only if using `UMP` or `SABR`; our browser example uses `UMP`) to determine if the stream needs a PoToken.

- **Status 1**: The stream is either already using a PoToken or does not need one.
- **Status 2**: The stream requires a PoToken but will allow the client to request up to 1-2 MB of data before interrupting playback.
- **Status 3**: The stream requires a PoToken and will interrupt playback immediately.

## License

Distributed under the [MIT](https://choosealicense.com/licenses/mit/) License.

<p align="right">
(<a href="#top">back to top</a>)
</p>
