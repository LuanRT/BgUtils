import { BGError, base64ToU8 } from '../utils/utils.mjs';
import { CREATE_CHALLENGE_URL, GOOG_API_KEY, USER_AGENT } from '../utils/constants.mjs';

/**
 * @typedef {{
 *  script?: (string | null)[];
 *  interpreterHash: string;
 *  globalName: string;
 *  challenge: string;
 *  messageId: string;
 * }} DescrambledChallenge
 */

/**
 * Creates a challenge.
 * @param {import('./index.mjs').BgConfig} bgConfig - The config.
 * @param {string} [interpreterHash] - The ID of the challenge script. If provided, the server will assume that
 * that the client already has the script and will not return it.
 * @returns {Promise<DescrambledChallenge | undefined>} - The challenge data.
 */
export async function create(bgConfig, interpreterHash) {
  const requestKey = bgConfig.requestKey;

  if (!requestKey)
    throw new BGError(0, '[Challenge]: Request key not provided');

  if (!bgConfig.fetch)
    throw new BGError(1, "[Challenge]: Fetch function not provided");

  const payload = [requestKey];

  if (interpreterHash)
    payload.push(interpreterHash);

  const response = await bgConfig.fetch(CREATE_CHALLENGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'User-Agent': USER_AGENT,
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok)
    throw new BGError(2, `[Challenge]: Failed to fetch challenge: ${response.status}`);

  const challenge = await response.json();

  if (challenge.length > 1 && challenge[1]) {
    const descrambledChallenge = descramble(challenge[1]);
    if (descrambledChallenge)
      return descrambledChallenge;
  }
}

/**
 * Descrambles the given scrambled challenge and parses it into an object.
 * @param {string} scrambledChallenge - The scrambled challenge.
 * @returns {DescrambledChallenge | undefined} The descrambled challenge:
 *   - script: The script associated with the challenge.
 *   - interpreterHash: The id of the script.
 *   - globalName: The name of the VM in the global scope.
 *   - challenge: The challenge data.
 *   - messageId: The ID of the JSPB message.
 */
export function descramble(scrambledChallenge) {
  const buffer = base64ToU8(scrambledChallenge);

  if (buffer.length) {
    const descrambled = new TextDecoder().decode(buffer.map(b => b + 97));
    const [messageId, script, , interpreterHash, challenge, globalName] = JSON.parse(descrambled);

    return {
      script,
      interpreterHash,
      globalName,
      challenge,
      messageId
    }
  }
}