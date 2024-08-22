import { BASE_URL, GOOG_API_KEY, USER_AGENT } from '../utils/index.js';
import { u8ToBase64, base64ToU8, BGError } from '../utils/index.js';
import type { BgConfig, BotguardResponse, PostProcessFunction, PoTokenArgs } from '../utils/index.js';

/**
 * Generates a Proof of Origin Token.
 * @param args - The arguments for generating the token.
 */
export async function generate(args: PoTokenArgs): Promise<string | undefined> {
  const { program, bgConfig, globalName } = args;
  const { identity } = bgConfig;

  const bg = await invokeBotguard(program, globalName, bgConfig);

  if (bg.postProcessFunctions.length) {
    const processIntegrityToken = bg.postProcessFunctions[0];

    if (!processIntegrityToken)
      throw new BGError(4, 'PMD:Undefined');

    const acquirePo = await processIntegrityToken(base64ToU8(bg.integrityToken));

    if (typeof acquirePo !== 'function')
      throw new BGError(16, 'APF:Failed');

    const buffer = await acquirePo(new TextEncoder().encode(identity));

    const poToken = u8ToBase64(buffer, true);

    if (poToken.length > 80)
      return poToken;
  }
}

type AttFunctions = {
  fn1: (
    (callback: (str: string) => void, args: any[]) => Promise<void>
  ) | null;
  fn2: (() => void) | null;
  fn3: (() => void) | null;
  fn4: (() => void) | null;
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

  const attFunctions: AttFunctions = { fn1: null, fn2: null, fn3: null, fn4: null };

  function attFunctionsCallback(fn1: AttFunctions['fn1'], fn2: AttFunctions['fn2'], fn3: AttFunctions['fn3'], fn4: AttFunctions['fn4']) {
    attFunctions.fn1 = fn1;
    attFunctions.fn2 = fn2;
    attFunctions.fn3 = fn3;
    attFunctions.fn4 = fn4;
  }

  if (!vm.a)
    throw new BGError(2, '[BG]: Init failed');

  try {
    await vm.a(program, attFunctionsCallback, true, undefined, () => {/** No-op */ });
  } catch (err: unknown) {
    throw new BGError(3, `[BG]: Failed to load program: ${(err as Error).message}`);
  }

  if (!attFunctions.fn1)
    throw new BGError(4, '[BG]: Att function 1 unavailable. Cannot proceed.');

  let botguardResponse: string | null = null;

  const postProcessFunctions: PostProcessFunction[] = [];

  await attFunctions.fn1((response) => botguardResponse = response, [ ,, postProcessFunctions ]);

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

  const integrityTokenData = await integrityTokenResponse.json();

  if (!integrityTokenData.length)
    throw new BGError(8, '[GenerateIT]: No integrity token data received');

  const integrityToken = integrityTokenData[0];

  if (typeof integrityToken !== 'string')
    throw new BGError(9, `[GenerateIT]: Expected integrity token to be a string but got ${typeof integrityToken}`);

  return {
    integrityToken,
    postProcessFunctions
  };
}

/**
 * Creates a placeholder PoToken. This can be used while `sps` (StreamProtectionStatus) is 2, but will not work once it changes to 3.
 * @param identity - Visitor data or datasync ID.
 */
export function generatePlaceholder(identity: string): string {
  if (identity.length > 118)
    throw new BGError(19, 'DFO:Invalid');

  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  const randomValues = [ Math.random() * 255, Math.random() * 255 ];

  const byteArray = randomValues
    .concat([ 0, 3 ])
    .concat([
      (currentTimeInSeconds >> 24) & 255,
      (currentTimeInSeconds >> 16) & 255,
      (currentTimeInSeconds >> 8) & 255,
      currentTimeInSeconds & 255
    ]);

  const result = new Uint8Array(2 + byteArray.length + identity.length);

  result[0] = 34;
  result[1] = byteArray.length + identity.length;

  result.set(byteArray, 2);
  result.set(new TextEncoder().encode(identity), 2 + byteArray.length);

  const dataArray = result.subarray(2);

  for (let i = randomValues.length; i < dataArray.length; ++i) {
    dataArray[i] ^= dataArray[i % randomValues.length];
  }

  return u8ToBase64(result);
}