# What Is This?
This library facilitates the creation of PoTokens by directly interacting with BotGuard's API.


- [What Is This?](#what-is-this)
  - [A Few Notes](#a-few-notes)
  - [Usage](#usage)
  - [Research](#research)
    - [Initialization Process](#initialization-process)
    - [Retrieving Integrity Token](#retrieving-integrity-token)
    - [Generating a PoToken](#generating-a-potoken)
    - [When to Use a PoToken](#when-to-use-a-potoken)
  - [License](#license)

## A Few Notes

1. This library does not bypass BotGuard; **you still need** an environment that passes its checks to use it. It is simply a reverse-engineered implementation of the same process that YouTube’s web player uses. It is not a crack or hack of any kind.

2. The library is not affiliated with Google or YouTube in any way. It is an independent project created for educational purposes. I am not responsible for any misuse of this library.

## Usage

Please refer to the provided examples [here](./examples/).

## Research

Below is a brief overview of the process to generate a PoToken for those interested in the inner workings of the library. This information is based on my own research and may become outdated as Google updates its systems.

### Initialization Process

To initialize the BotGuard VM, we must first retrieve its script and challenge:
```shell
curl --request POST \
  --url 'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create' \
  --header 'Content-Type: application/json+protobuf' \
  --header 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36(KHTML, like Gecko)' \
  --header 'x-goog-api-key: AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw' \
  --header 'x-user-agent: grpc-web-javascript/0.1' \
  --data '[ "requestKeyHere" ]'
```

Once the data from the request is available, it must be descrambled and parsed:
```js
// ...
const buffer = base64ToU8(scrambledChallenge);
const descrambled = new TextDecoder().decode(buffer.map((b) => b + 97));
const challengeData = JSON.parse(descrambled);
```

The descrambled data should consist of a message ID, the interpreter javascript, the interpreter hash, a program, and the script's global name. 

To make the VM available in the global scope, evaluate the script. If all goes well, you should be able to access the VM from your browser or program.

### Retrieving Integrity Token

This is a very important step. The Integrity Token is retrieved from an attestation server and takes the result of the BotGuard challenge, likely to evaluate the integrity of the runtime environment. To "solve" the challenge, you must invoke BotGuard and use the program we retrieved as its first parameter:

```js
// ...
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
2. An array with four items. You can leave most of them as undefined/null, except for the third one, which should point to an array. BotGuard will fill it with one or more functions if the challenge is successfully solved.

```js
// ...
/** @type {string | null} */
let botguardResponse = null;
/** @type {(PostProcessFunction | undefined)[]} */
let postProcessFunctions = [];

await attFunctions.fn1((response) => botguardResponse = response, [, , postProcessFunctions,]);
```

If everything was done correctly so far, you should have a token and an array with one or more functions.

Now we can create the payload for the request we'll be making next. It should consist of an array with two items: the first should be the request key, and the second should be the token we just got:
  
```shell
curl --request POST \
  --url 'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json+protobuf' \
  --header 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36(KHTML, like Gecko)' \
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

The first item is the integrity token, the second one is the TTL (Time to Live), and the third is the refresh threshold.

Store the token and the first function from the array we got earlier. We'll use them to construct the PoToken.

### Generating a PoToken

First, call the function from the last step using the integrity token (in bytes) as an argument.

```js
const processIntegrityToken = bg.postProcessFunctions[0];

if (!processIntegrityToken)
  throw new BGError(4, "PMD:Undefined");

const acquirePo = await processIntegrityToken(base64ToU8(bg.integrityToken));
```

If this call succeeds, you should get another function. Call it with your Visitor ID (or Data Sync ID if you're signed in) as its first argument.
```js
const buffer = await acquirePo(new TextEncoder().encode(identifier));

const poToken = u8ToBase64(buffer, true);

if (poToken.length > 80)
  return poToken;
```

The result will be a sequence of bytes, with a length of around 110-128 bytes. Base64 encode it, and you'll have your PoToken!

### When to Use a PoToken

YouTube's web player checks the "sps" (`StreamProtectionStatus`) of each media segment request (only if using `UMP` or `SABR`; our browser example uses `UMP`) to determine if the stream needs a PoToken.

- **Status 1**: The stream is either already using a PoToken or does not need one.
- **Status 2**: The stream requires a PoToken but will allow the client to request up to 1-2MB of data before interrupting playback.
- **Status 3**: The stream requires a PoToken and will interrupt playback immediately.

## License

Distributed under the [MIT](https://choosealicense.com/licenses/mit/) License.

<p align="right">
(<a href="#top">back to top</a>)
</p>
