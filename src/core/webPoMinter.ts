import { base64ToU8, BGError, u8ToBase64 } from '../utils/helpers.js';
import type { IntegrityTokenData, MintCallback, WebPoSignalOutput } from '../utils/types.js';

export default class WebPoMinter {
  private readonly mintCallback: MintCallback;

  constructor(mintCallback: MintCallback) {
    this.mintCallback = mintCallback;
  }

  public static async create(integrityTokenResponse: IntegrityTokenData, webPoSignalOutput: WebPoSignalOutput) {
    const getMinter = webPoSignalOutput[0];

    if (!getMinter)
      throw new BGError('VM_ERROR', 'PMD:Undefined');

    if (!integrityTokenResponse.integrityToken)
      throw new BGError('INTEGRITY_ERROR', 'No integrity token provided', { integrityTokenResponse });

    const mintCallback = await getMinter(base64ToU8(integrityTokenResponse.integrityToken));

    if (!(mintCallback instanceof Function))
      throw new BGError('VM_ERROR', 'APF:Failed');

    return new WebPoMinter(mintCallback);
  }

  public async mintAsWebsafeString(identifier: string): Promise<string> {
    const result = await this.mint(identifier);
    return u8ToBase64(result, true);
  }

  public async mint(identifier: string): Promise<Uint8Array> {
    const result = await this.mintCallback(new TextEncoder().encode(identifier));

    if (!result)
      throw new BGError('VM_ERROR', 'YNJ:Undefined');

    if (!(result instanceof Uint8Array))
      throw new BGError('VM_ERROR', 'ODM:Invalid');

    return result;
  }
}