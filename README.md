# What Is This?
This library facilitates the generation of PoTokens (Proof of Identity Token) without external dependencies.

- [What Is This?](#what-is-this)
  - [Features](#features)
  - [Caveats](#caveats)
  - [Usage](#usage)
  - [Research](#research)
    - [When to Use a PoToken](#when-to-use-a-potoken)
    - [Initialization Process](#initialization-process)
    - [Retrieving Integrity Token](#retrieving-integrity-token)
    - [Generating a PoToken](#generating-a-potoken)

## Features 

- **No browser**: Integrates directly with BotGuard, avoiding the need for browsers.
- **Works anywhere**: Node.js, Deno, and modern browsers are currently supported.
- **Extremely fast**: No browser also means no unneeded assets and scripts being downloaded, making it much more efficient.
- **Lightweight**: The library is less than 8KB in size!

## Caveats

1. Currently, the BotGuard script needs a "good enough" `document` implementation to work. Libraries like `jsdom` can be used to provide a virtual `document`, and an example of how to do this can be found [here](./examples/node). Note that this is only necessary for Node.js and Deno. Electron and other Chromium-based environments should work out of the box with 0 dependencies.

2. Suppose the browser requirements change in the future. In that case, `jsdom` and similar libraries may not be able to provide the necessary functionality, and thus the library may only work in web applications.

## Usage

Please refer to the provided examples:
[Browsers](./examples/browser) | [Node.js & Deno](./examples/node)

## Research

Below is a brief overview of the process to generate a PoToken for those interested in the inner workings of the library and seeking to port it to other languages.

### When to Use a PoToken

YouTube's web player checks the "sps" (`StreamProtectionStatus`) of each media segment request (only if using `UMP` or `SABR`; our browser example uses `UMP`) to determine if the stream needs a PoToken.

- **Status 1**: The stream is either already using a PoToken or does not need one.
- **Status 2**: The stream requires a PoToken but will allow the client to request up to 1-2MB of data before interrupting playback.
- **Status 3**: The stream requires a PoToken and will interrupt playback immediately.

---

### Initialization Process

To initialize the bg VM, we must first retrieve its script & challenge:
```shell
curl --request POST \
  --url 'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create' \
  --header 'Content-Type: application/json+protobuf' \
  --header 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36' \
  --header 'x-goog-api-key: AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw' \
  --header 'x-user-agent: grpc-web-javascript/0.1' \
  --data '[ "requestKeyHere" ]'
```

Once the data from the request is available, it must then be descrambled and parsed. The descrambled data should consist of a tag, a program, a script, and a token of unknown purpose.

To make the VM available in the global scope, evaluate the script. If all goes well, you should be able to access the VM from your browser or program.

### Retrieving Integrity Token

This is a very important step. The Integrity Token is retrieved from an attestation server, it takes the result of the BotGuard challenge, likely to evaluate the integrity of the runtime environment.

To "solve" the challenge, you must invoke BotGuard and use the program we retrieved as its first parameter.

```js
if (!vm.a)
  throw new BGError(2, "[BG]: Init failed");

try {
  await vm.a(program, attFunctionsCallback, true, undefined, () => {/** no-op */ });
} catch (err) {
  throw new BGError(3, `[BG]: Failed to load program: ${err.message}`);
}
```

The second parameter should point to a callback function, where BotGuard will return another function that will later be used to retrieve the payload for the integrity token request.

Once that function is available, call it with the following arguments:
1. A callback function with one argument. This function will return the token for the attestation request.
2. An array with 4 items. You can leave most of them as undefined/null, except for the 3rd item, point it to an array, BotGuard will fill it with one or more functions if the challenge is successfully solved.

```js
// ...
/** @type {string | null} */
let botguardResponse = null;
/** @type {Function[]} */
let postProcessFunctions = [];
/** @type {string | null} */
let integrityToken = null;

await attFunctions.fn1((response) => botguardResponse = response, [, , postProcessFunctions,]);
```

If everything was done correctly so far, you should have a token and an array with one or more functions.

Now we can create the payload for the request we'll be doing next! It should consist of an array with two items, the first one should be the request key and the second one should be the token we just got:
  
```shell
curl --request POST \
  --url 'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json+protobuf' \
  --header 'User-Agent: insomnia/9.3.3' \
  --header 'x-goog-api-key: AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw' \
  --header 'x-user-agent: grpc-web-javascript/0.1' \
  --data '[ "requestKeyHere", "$abcdeyourtokenhere" ]'
```

If the API call is successful, you will get a JSPB response (json+protobuf) that looks like this:
```json
[
	"azXvdvYQKz8ff4h9PjIlQI7JUOTtYnBdXEGs4bmQb8FvmFB+oosILg6flcoDfzFpwas/hitYcUzx3Qm+DFtQ9slN",
	43200,
	100,
]
```

The first item is the integrity token, the second one is the ttl, and the third should be the refresh threshold. 

Store the token and the first function of the array we got earlier. We'll use them to construct the PoToken.

### Generating a PoToken

First, call the function from the last step using the integrity token (in bytes) as an argument.

```js
const processIntegrityToken = bg.postProcessFunctions[0];

if (!processIntegrityToken)
  throw new BGError(4, "PMD:Undefined");

const acquirePo = await processIntegrityToken(base64ToU8(bg.integrityToken));
```

If this call succeeds, you should get another function. Call it with your visitor data id (in bytes) as its first argument. 
```js
const buffer = await acquirePo(new TextEncoder().encode(visitorData));

const poToken = u8ToBase64(buffer, true);

if (poToken.length > 80)
  return poToken;
```

The result will be a sequence of bytes, with a length of around 110-128 bytes. Convert it to a string and you'll have a valid PoToken!