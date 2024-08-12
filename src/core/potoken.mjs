import { GENERATE_IT_URL, GOOG_API_KEY, USER_AGENT } from '../utils/constants.mjs';
import { Qe, ej, w, Ze, bj, BGError } from '../utils/utils.mjs';

/**
 * @typedef {{
 *  program: string;
 *  bgConfig: import('./index.mjs').BgConfig;
 *  globalName: string;
 * }} CreatePoTokenArgs
 */

/**
 * Generates a Proof of Origin token.
 * @param {CreatePoTokenArgs} args - The arguments for generating the token.
 * @returns {Promise<string>} - A Proof of Origin token.
 * @throws {BGError} If an error occurs during token generation.
 */
export async function create(args) {
  const { program, bgConfig, globalName } = args;
  const { visitorData } = bgConfig;

  const bg = await initBotguard(bgConfig, program, globalName);

  if (bg.e4) {
    const X = bg.e4[0];

    if (!X)
      throw new BGError(4, "PMD:Undefined");

    const V = await X(Ze({ j: bg.integrityToken }));

    if ((typeof V !== "function"))
      throw new BGError(16, "APF:Failed");

    const a = bj(undefined, function () {
      return V(new TextEncoder().encode(visitorData));
    }, "C");

    const poToken = Qe(a, 2);

    if (poToken.length > 80)
      return poToken;
  }
}

/**
 * @typedef {{
 *  e4: Function[];
 *  integrityToken: string;
 * }} BotguardResponse
 */

/**
 * Initializes the Botguard VM.
 * @param {import('./index.mjs').BgConfig} bgConfig
 * @param {string} program 
 * @param {string} globalName 
 * @returns {Promise<BotguardResponse>}
 */
async function initBotguard(bgConfig, program, globalName) {
  const vm = bgConfig.globalObj[globalName];
  const clientId = bgConfig.clientId;

  if (!vm)
    throw new BGError(1, "VM:Unavailable");

  if (!clientId)
    throw new BGError(2, "CID:Unavailable");

  if (!bgConfig.fetch)
    throw new BGError(3, "Fetch:Unavailable");

  let C;
  let BC;

  let d = {
    j: 0,
    Uf: {
      nG: function (p, q) {
        // Used for statistics.
      }
    }
  };

  function b(p, q, r, t) {
    Promise.resolve().then(function () {
      // Some of these are used to create att tokens for the stats endpoint. Only E7 is used for the potoken.
      m.resolve({
        E7: p,
        Aea: q,
        cda: r,
        Xma: t
      });
    });
  }

  function c(p, q, r, t) {
    var u = "k";
    q ? u = "h" : r && (u = "u");
    u !== "k" ? t !== 0 && d.Uf.nG(u, p) : d.j <= 0 ? (d.Uf.nG(u, p),
      d.j = Math.floor(Math.random() * 200)) : d.j--;
  }

  var m = new ej();
  const B = m.promise;

  try {
    C = w((0, vm.a)(program, b, true, undefined, c)).next().value;
    BC = m.promise.then(function () { });
  } catch (p) {
    console.error(p);
  }

  const data = {
    zl: undefined,
    eU: undefined,
    hU: undefined
  };

  const e4 = [];

  const iTokenPayload = B.then(function (l) {
    var d = l.E7;
    return new Promise(function (resolve) {
      d(function (h) {
        // h is GenerateIT's payload token
        resolve(h);
      }, [data.zl, data.eU, e4, data.hU]);
    });
  });

  const body = [clientId, await iTokenPayload];

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1',
      'User-Agent': USER_AGENT,
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  };

  const generateIntegrityTokenResponse = await bgConfig.fetch(GENERATE_IT_URL, options);

  if (!generateIntegrityTokenResponse.ok) {
    throw new Error('Failed to generate integrity token');
  }

  const integrityTokenData = await generateIntegrityTokenResponse.json();

  return { e4, integrityToken: integrityTokenData[0] };
}