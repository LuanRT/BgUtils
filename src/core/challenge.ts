import { BGError, base64ToU8, BASE_URL, GOOG_API_KEY, USER_AGENT } from '../utils/index.js';
import type { DescrambledChallenge, BgConfig } from '../utils/index.js';

/**
 * Creates a challenge.
 * @param bgConfig - The config.
 * @param interpreterHash - The ID of the challenge script. If provided, the server will assume that
 * the client already has the script and will not return it.
 * @returns The challenge data.
 */
export async function create(bgConfig: BgConfig, interpreterHash?: string): Promise<DescrambledChallenge | undefined> {
  const requestKey = bgConfig.requestKey;

  if (!requestKey)
    throw new BGError(0, '[Challenge]: Request key not provided');

  if (!bgConfig.fetch)
    throw new BGError(1, '[Challenge]: Fetch function not provided');

  const payload = [ requestKey ];

  if (interpreterHash)
    payload.push(interpreterHash);

  const response = await bgConfig.fetch(new URL('/$rpc/google.internal.waa.v1.Waa/Create', BASE_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'User-Agent': USER_AGENT,
      'X-Goog-Api-Key': GOOG_API_KEY,
      'X-User-Agent': 'grpc-web-javascript/0.1'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok)
    throw new BGError(2, `[Challenge]: Failed to fetch challenge: ${response.status}`);

  const rawData = await response.json() as unknown[];

  return parseChallengeData(rawData);
}

/**
 * Parses the challenge data from the provided response data.
 */
export function parseChallengeData(rawData: Record<string, any>): DescrambledChallenge | undefined {
  let challengeData: any[] = [];

  if (rawData.length > 1 && typeof rawData[1] === 'string') {
    const descrambled = descramble(rawData[1]);
    challengeData = JSON.parse(descrambled || '[]');
  } else if (rawData.length && typeof rawData[0] === 'object') {
    challengeData = rawData[0];
  }

  const [ messageId, wrappedScript, , interpreterHash, program, globalName, , clientExperimentsStateBlob ] = challengeData;

  const privateDoNotAccessOrElseSafeScriptWrappedValue = Array.isArray(wrappedScript) ? wrappedScript.find((value) => value && typeof value === 'string') : null;

  return {
    messageId,
    interpreterJavascript: {
      privateDoNotAccessOrElseSafeScriptWrappedValue
    },
    interpreterHash,
    program,
    globalName,
    clientExperimentsStateBlob
  };
}

/**
 * Descrambles the given challenge data.
 */
export function descramble(scrambledChallenge: string): string | undefined {
  const buffer = base64ToU8(scrambledChallenge);
  if (buffer.length)
    return new TextDecoder().decode(buffer.map((b) => b + 97));
}