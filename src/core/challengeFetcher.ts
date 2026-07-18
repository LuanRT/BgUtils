import { base64ToU8, BgError, buildURL, getHeaders } from '../utils/helpers.js';
import type { ChallengeFetcherConfig, IBotguardClientSideBgChallenge } from '../utils/types.js';

/**
 * Fetches a BotGuard challenge using the provided configuration.
 * @NOTE
 * For YouTube specifically, you may need to fetch it using InnerTube instead
 * depending on the client.
 */
export async function getChallenge(config: ChallengeFetcherConfig): Promise<IBotguardClientSideBgChallenge> {
  const { requestKey, interpreterHash, fetchFunction, useYouTubeAPI } = config;

  if (!fetchFunction)
    throw new BgError('No fetch function provided');

  if (!requestKey)
    throw new BgError('No request key provided');

  const payload = [ requestKey ];

  if (interpreterHash)
    payload.push(interpreterHash);

  const response = await fetchFunction(buildURL('Create', useYouTubeAPI), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok)
    throw new BgError('Failed to fetch challenge', { status: response.status });

  const rawData = await response.json() as unknown[];

  return parseChallengeData(rawData);
}

/**
 * Parses the challenge data from the provided response data.
 */
export function parseChallengeData(rawData: Record<string, any>): IBotguardClientSideBgChallenge {
  let challengeData: any[] = [];

  if (rawData.length > 1 && typeof rawData[1] === 'string') {
    const descrambled = descrambleChallenge(rawData[1]);
    challengeData = JSON.parse(descrambled || '[]');
  } else if (rawData.length && typeof rawData[0] === 'object') {
    challengeData = rawData[0];
  }

  const [ messageId, wrappedScript, wrappedUrl, interpreterHash, program, globalName, , clientExperimentsStateBlob ] = challengeData;
  const privateDoNotAccessOrElseSafeScriptWrappedValue = Array.isArray(wrappedScript) ? wrappedScript.find((value) => value && typeof value === 'string') : undefined;
  const privateDoNotAccessOrElseTrustedResourceUrlWrappedValue = Array.isArray(wrappedUrl) ? wrappedUrl.find((value) => value && typeof value === 'string') : undefined;

  const clientSideBgChallenge: IBotguardClientSideBgChallenge = {
    messageId,
    interpreterHash,
    program,
    globalName,
    clientExperimentsStateBlob
  };

  if (privateDoNotAccessOrElseSafeScriptWrappedValue) {
    clientSideBgChallenge.interpreterJavascript = {
      privateDoNotAccessOrElseSafeScriptWrappedValue
    };
  }
  
  if (privateDoNotAccessOrElseTrustedResourceUrlWrappedValue) {
    clientSideBgChallenge.interpreterUrl = {
      privateDoNotAccessOrElseTrustedResourceUrlWrappedValue
    };
  }
  
  return clientSideBgChallenge;
}

/**
 * Descrambles the given challenge data.
 */
export function descrambleChallenge(scrambledChallenge: string): string | undefined {
  const buffer = base64ToU8(scrambledChallenge);
  if (buffer.length)
    return new TextDecoder().decode(buffer.map((b) => b + 97));
}