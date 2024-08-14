import { GENERATE_IT_URL, GOOG_API_KEY, USER_AGENT } from '../utils/constants.mjs';
import { u8ToBase64, BGError, base64ToU8 } from '../utils/utils.mjs';

/**
 * @typedef {{
 *  program: string;
 *  bgConfig: import('./index.mjs').BgConfig;
 *  globalName: string;
 * }} PoTokenArgs
 */

/**
 * Generates a Proof of Origin Token.
 * @param {PoTokenArgs} args - The arguments for generating the token.
 * @returns {Promise<string | undefined>} - A Proof of Origin token.
 * @throws {BGError} If an error occurs during token generation.
 */
export async function generate(args) {
  const { program, bgConfig, globalName } = args;
  const { identity } = bgConfig;

  const bg = await invokeBotguard(program, globalName, bgConfig);

  if (bg.postProcessFunctions.length) {
    const processIntegrityToken = bg.postProcessFunctions[0];

    if (!processIntegrityToken)
      throw new BGError(4, "PMD:Undefined");

    const acquirePo = await processIntegrityToken(base64ToU8(bg.integrityToken));

    if (typeof acquirePo !== "function")
      throw new BGError(16, "APF:Failed");

    const buffer = await acquirePo(new TextEncoder().encode(identity));

    const poToken = u8ToBase64(buffer, true);

    if (poToken.length > 80)
      return poToken;
  }
}

/**
 * @typedef {{
 *  postProcessFunctions: Function[];
 *  integrityToken: string;
 * }} BotguardResponse
 */

/**
 * Initializes the Botguard VM.
 * @param {string} program 
 * @param {string} globalName 
 * @param {import('./index.mjs').BgConfig} bgConfig
 * @returns {Promise<BotguardResponse>}
 */
async function invokeBotguard(program, globalName, bgConfig) {
  const vm = bgConfig.globalObj[globalName];
  const requestKey = bgConfig.requestKey;

  if (!vm)
    throw new BGError(1, "[BG]: VM not found in the global object");

  if (!requestKey)
    throw new BGError(1, "[BG]: Request key not provided");

  if (!bgConfig.fetch)
    throw new BGError(1, "[BG]: Fetch function not provided");

  /**
   * @typedef {{
   *  fn1: Promise<any> | null;
   *  fn2: Promise<any> | null;
   *  fn3: Promise<any> | null;
   *  fn4: Promise<any> | null;
   * }} AttFunctions
   */

  /** @type {AttFunctions} */
  let attFunctions = { fn1: null, fn2: null, fn3: null, fn4: null };

  function attFunctionsCallback(fn1, fn2, fn3, fn4) {
    attFunctions.fn1 = fn1;
    attFunctions.fn2 = fn2;
    attFunctions.fn3 = fn3;
    attFunctions.fn4 = fn4;
  }

  if (!vm.a)
    throw new BGError(2, "[BG]: Init failed");

  try {
    await vm.a(program, attFunctionsCallback, true, undefined, () => {/** no-op */});
  } catch (err) {
    throw new BGError(3, `[BG]: Failed to load program: ${err.message}`);
  }

  if (!attFunctions.fn1)
    throw new BGError(4, "[BG]: Att function 1 unavailable. Cannot proceed.");

  /** @type {string | null} */
  let botguardResponse = null;
  /** @type {Function[]} */
  let postProcessFunctions = [];
  /** @type {string | null} */
  let integrityToken = null;

  await attFunctions.fn1((response) => botguardResponse = response, [, , postProcessFunctions,]);

  if (!botguardResponse)
    throw new BGError(5, "[BG]: No response");

  if (!postProcessFunctions.length)
    throw new BGError(6, "[BG]: Got response but no post-process functions");

  const payload = [requestKey, botguardResponse];

  const integrityTokenResponse = await bgConfig.fetch(GENERATE_IT_URL, {
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

  if (!integrityTokenData.length || !integrityTokenData[0])
    throw new BGError(8, "[GenerateIT]: Expected an integrity token but got none");

  integrityToken = integrityTokenData[0];

  return {
    integrityToken,
    postProcessFunctions
  };
}

/**
 * Creates a placeholder PoToken. This can be used while `sps` (StreamProtectionStatus) is 2, but will not work once it changes to 3.
 * @param {string} identity - Visitor data or datasync ID.
 * @returns {string}
 */
export function generatePlaceholder(identity) {
  if (identity.length > 118)
    throw new BGError(19, "DFO:Invalid");

  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  const randomValues = [Math.random() * 255, Math.random() * 255];

  const byteArray = randomValues
    .concat([0, 3])
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
  result.set(identity, 2 + byteArray.length);

  const dataArray = result.subarray(2);

  for (let i = randomValues.length; i < dataArray.length; ++i) {
    dataArray[i] ^= dataArray[i % randomValues.length];
  }

  return u8ToBase64(result);
}