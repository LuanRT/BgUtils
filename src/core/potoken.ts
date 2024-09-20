import { BASE_URL, GOOG_API_KEY, USER_AGENT } from '../utils/index.js';
import { u8ToBase64, base64ToU8, BGError } from '../utils/index.js';
import type { BgConfig, BotguardResponse, PostProcessFunction, PoTokenArgs } from '../utils/index.js';

/**
 * Generates a Proof of Origin Token.
 * @param args - The arguments for generating the token.
 */
export async function generate(args: PoTokenArgs): Promise<string | undefined> {
  const { program, bgConfig, globalName } = args;
  const { identifier } = bgConfig;

  const bg = await invokeBotguard(program, globalName, bgConfig);

  if (bg.postProcessFunctions.length) {
    const processIntegrityToken = bg.postProcessFunctions[0];

    if (!processIntegrityToken)
      throw new BGError(4, 'PMD:Undefined');

    const acquirePo = await processIntegrityToken(base64ToU8(bg.integrityToken));

    if (typeof acquirePo !== 'function')
      throw new BGError(16, 'APF:Failed');

    const result = await acquirePo(new TextEncoder().encode(identifier));

    if (!result)
      throw new BGError(17, 'YNJ:Undefined'); 

    if (!(result instanceof Uint8Array))
      throw new BGError(18, 'ODM:Invalid');

    return u8ToBase64(result, true);
  }
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

  const attFunctionsCallback = (
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
    await vm.a(program, attFunctionsCallback, true, undefined, () => {/** No-op */ });
  } catch (err: unknown) {
    throw new BGError(3, `[BG]: Failed to load program: ${(err as Error).message}`);
  }

  if (!attFunctions.fn1)
    throw new BGError(4, '[BG]: Att function 1 unavailable. Cannot proceed.');

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
 * @param identifier - Visitor ID or Data Sync ID.
 */
export function generatePlaceholder(identifier: string): string {
  if (identifier.length > 118)
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

  const result = new Uint8Array(2 + byteArray.length + identifier.length);

  result[0] = 34;
  result[1] = byteArray.length + identifier.length;

  result.set(byteArray, 2);
  result.set(new TextEncoder().encode(identifier), 2 + byteArray.length);

  const dataArray = result.subarray(2);

  for (let i = randomValues.length; i < dataArray.length; ++i) {
    dataArray[i] ^= dataArray[i % randomValues.length];
  }

  return u8ToBase64(result);
}