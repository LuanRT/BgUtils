import { BASE_URL, GOOG_API_KEY, USER_AGENT } from '../utils/index.js';
import { u8ToBase64, base64ToU8, BGError } from '../utils/index.js';
import type { BgConfig, BotguardResponse, PostProcessFunction, PoTokenArgs, PoTokenResult } from '../utils/index.js';

/**
 * Generates a Proof of Origin Token.
 * @param args - The arguments for generating the token.
 */
export async function generate(args: PoTokenArgs): Promise<PoTokenResult> {
  const { program, bgConfig, globalName } = args;
  const { identifier } = bgConfig;

  const bgResult = await invokeBotguard(program, globalName, bgConfig);

  if (bgResult.postProcessFunctions.length) {
    const processIntegrityToken = bgResult.postProcessFunctions[0];

    if (!processIntegrityToken)
      throw new BGError(4, 'PMD:Undefined');

    const acquirePo = await processIntegrityToken(base64ToU8(bgResult.integrityTokenData.integrityToken ?? bgResult.integrityTokenData.websafeFallbackToken ?? ''));

    if (typeof acquirePo !== 'function')
      throw new BGError(16, 'APF:Failed');

    const result = await acquirePo(new TextEncoder().encode(identifier));

    if (!result)
      throw new BGError(17, 'YNJ:Undefined');

    if (!(result instanceof Uint8Array))
      throw new BGError(18, 'ODM:Invalid');

    return {
      poToken: u8ToBase64(result, true),
      integrityTokenData: bgResult.integrityTokenData
    };
  }

  throw new BGError(0, '[BG]: Failed to process integrity token data');
}

type AttFunctions = {
  fn1?: (
    (callback: (str: string) => void, args: any[]) => Promise<string>
  );
  fn2?: (() => void);
  fn3?: (() => void);
  fn4?: (() => void);
};

/**
 * Invokes the Botguard VM.
 * @param program - The bytecode to run.
 * @param globalName - The name of the VM in the global scope.
 * @param bgConfig - The Botguard configuration.
 */
async function invokeBotguard(program: string, globalName: string, bgConfig: BgConfig): Promise<BotguardResponse> {
  const vm = bgConfig.globalObj[globalName];
  const requestKey = bgConfig.requestKey;

  if (!vm)
    throw new BGError(1, '[BG]: VM not found in the global object');

  if (!requestKey)
    throw new BGError(1, '[BG]: Request key not provided');

  if (!bgConfig.fetch)
    throw new BGError(1, '[BG]: Fetch function not provided');

  const attFunctions: AttFunctions = {};

  const setAttFunctions = (
    fn1: AttFunctions['fn1'],
    fn2: AttFunctions['fn2'],
    fn3: AttFunctions['fn3'],
    fn4: AttFunctions['fn4']
  ) => {
    Object.assign(attFunctions, { fn1, fn2, fn3, fn4 });
  };

  if (!vm.a)
    throw new BGError(2, '[BG]: Init failed');

  try {
    await vm.a(program, setAttFunctions, true, undefined, () => {/** no-op */ });
  } catch (err: unknown) {
    throw new BGError(3, `[BG]: Failed to load program: ${(err as Error).message}`);
  }

  if (!attFunctions.fn1)
    throw new BGError(4, '[BG]: Att function unavailable. Cannot proceed.');

  let botguardResponse: string | undefined;

  const postProcessFunctions: (PostProcessFunction | undefined)[] = [];

  await attFunctions.fn1(
    (response) => (botguardResponse = response),
    [ , , postProcessFunctions ]
  );

  if (!botguardResponse)
    throw new BGError(5, '[BG]: No response');

  if (!postProcessFunctions.length)
    throw new BGError(6, '[BG]: Got response but no post-process functions');

  const payload = [ requestKey, botguardResponse ];

  const integrityTokenResponse = await bgConfig.fetch(new URL('/$rpc/google.internal.waa.v1.Waa/GenerateIT', BASE_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1',
      'User-Agent': USER_AGENT,
      'Accept': '*/*'
    },
    body: JSON.stringify(payload)
  });

  if (!integrityTokenResponse.ok)
    throw new BGError(7, '[GenerateIT]: Failed to generate integrity token');

  const integrityTokenData = await integrityTokenResponse.json() as unknown[];

  if (!integrityTokenData.length)
    throw new BGError(8, '[GenerateIT]: No integrity token data received');

  const [ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken ] = integrityTokenData;

  if (integrityToken !== undefined && typeof integrityToken !== 'string')
    throw new BGError(9, '[GenerateIT]: Invalid integrity token');

  if (estimatedTtlSecs !== undefined && typeof estimatedTtlSecs !== 'number')
    throw new BGError(10, '[GenerateIT]: Invalid TTL');

  if (mintRefreshThreshold !== undefined && typeof mintRefreshThreshold !== 'number')
    throw new BGError(11, '[GenerateIT]: Invalid mint refresh threshold');

  if (websafeFallbackToken !== undefined && typeof websafeFallbackToken !== 'string')
    throw new BGError(12, '[GenerateIT]: Invalid websafe fallback token');

  return {
    integrityTokenData: {
      integrityToken,
      estimatedTtlSecs,
      mintRefreshThreshold,
      websafeFallbackToken
    },
    postProcessFunctions
  };
}

/**
 * Creates a placeholder PoToken. This can be used while `sps` (StreamProtectionStatus) is 2, but will not work once it changes to 3.
 * @param identifier - Visitor ID or Data Sync ID.
 */
export function generatePlaceholder(identifier: string, clientState?: number): string {
  const encodedIdentifier = new TextEncoder().encode(identifier);

  if (encodedIdentifier.length > 118)
    throw new BGError(19, 'DFO:Invalid');

  const timestamp = Math.floor(Date.now() / 1000);
  const randomKeys = [ Math.floor(Math.random() * 256), Math.floor(Math.random() * 256) ];

  // NOTE: The "0" value before the client state is supposed to be someVal & 0xFF.
  // It is always 0 though, so I didn't bother investigating further.
  const header = randomKeys.concat(
    [
      0, (clientState ?? 1)
    ],
    [
      (timestamp >> 24) & 0xFF,
      (timestamp >> 16) & 0xFF,
      (timestamp >> 8) & 0xFF,
      timestamp & 0xFF
    ]
  );

  const packet = new Uint8Array(2 + header.length + encodedIdentifier.length);

  packet[0] = 34;
  packet[1] = header.length + encodedIdentifier.length;

  packet.set(header, 2);
  packet.set(encodedIdentifier, 2 + header.length);

  const payload = packet.subarray(2);

  const keyLength = randomKeys.length;

  for (let i = keyLength; i < payload.length; i++) {
    payload[i] ^= payload[i % keyLength];
  }

  return u8ToBase64(packet, true);
}

/**
 * Decodes a placeholder potoken string into its components.
 * @param placeholder - The placeholder potoken to decode.
 * @throws Error if the packet length is invalid.
 */
export function decodePlaceholder(placeholder: string) {
  const packet = base64ToU8(placeholder);

  const payloadLength = packet[1];
  const totalPacketLength = 2 + payloadLength;

  if (packet.length !== totalPacketLength)
    throw new Error('Invalid packet length.');

  const payload = packet.subarray(2);

  // Decrypt the payload by reversing the XOR operation
  const keyLength = 2;
  for (let i = keyLength; i < payload.length; ++i) {
    payload[i] ^= payload[i % keyLength];
  }

  const keys = [ payload[0], payload[1] ];

  const unknownVal = payload[2]; // The masked property I mentioned in the function above
  const clientState = payload[3];

  const timestamp =
    (payload[4] << 24) |
    (payload[5] << 16) |
    (payload[6] << 8) |
    payload[7];

  const date = new Date(timestamp * 1000);
  const identifier = new TextDecoder().decode(payload.subarray(8));

  return {
    identifier,
    timestamp,
    unknownVal,
    clientState,
    keys,
    date
  };
}