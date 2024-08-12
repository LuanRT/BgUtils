import { e1, mg, Ze } from '../utils/utils.mjs';
import { CREATE_CHALLENGE_URL, GOOG_API_KEY, USER_AGENT } from '../utils/constants.mjs';

/**
 * Retrieves a challenge for the specified client ID.
 * @param {import('./index.mjs').BgConfig} bgConfig - The config.
 * @param {string} scriptId - The ID of the challenge script. If provided, the server will assume that
 * that the client already has the script and will not return it.
 */
export async function get(bgConfig, scriptId) {
  const clientId = bgConfig.clientId;

  if (!clientId)
    throw new Error('CID:Unavailable');

  if (!bgConfig.fetch)
    throw new PoTokenError(3, "Fetch:Unavailable");

  const payload = [clientId];

  if (scriptId)
    payload.push(scriptId);

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

  if (!response.ok) {
    throw new Error('Failed to retrieve challenge');
  }

  const challenge = await response.json();

  if (challenge[1])
    return descramble(challenge[1]);
}

/**
 * @typedef {{
 *  script?: (string | null)[];
 *  scriptId: string;
 *  globalName: string;
 *  challenge: string;
 *  unkVar: string;
 * }} DescrambledChallenge
 */

/**
 * Descrambles the given scrambled challenge and parses it into an object.
 * @param {string} scrambledChallenge - The scrambled challenge.
 * @returns {DescrambledChallenge} The descrambled challenge:
 *   - script: The script associated with the challenge.
 *   - scriptId: The id of the script.
 *   - globalName: The name of the VM in the global scope.
 *   - challenge: The challenge data.
 *   - unkVar: An unknown variable.
 */
export function descramble(scrambledChallenge) {
  let result = null;

  const sChal = [null, scrambledChallenge];
  sChal['Symbol()'] = e1;

  const h = Ze(mg(sChal, 2));

  if (h.length) {
    var p = new Uint8Array(h.length);
    for (var q = 0; q < h.length; q++)
      p[q] = h[q] + 97;
    if (typeof TextDecoder !== "undefined")
      p = (new TextDecoder).decode(p);
    else if (p.length <= 8192)
      p = String.fromCharCode.apply(null, p);
    else {
      q = "";
      for (var r = 0; r < p.length; r += 8192)
        q += String.fromCharCode.apply(null, Array.prototype.slice.call(p, r, r + 8192));
      p = q;
    }
    result = JSON.parse(p);
  }

  const [unkVar, script, , scriptId, challenge, globalName ] = result;

  return {
    script,
    scriptId,
    globalName,
    challenge,
    unkVar
  }
}