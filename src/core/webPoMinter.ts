import { base64ToU8, u8ToBase64 } from '../utils/helpers.js';
import type { IntegrityTokenData, MintCallback, WebPoSignalOutput } from '../utils/types.js';

export class WebPoMinter {
  private mintCallback: MintCallback;

  constructor(mintCallback: MintCallback) {
    this.mintCallback = mintCallback;
  }

  public static async create(integrityTokenResponse: IntegrityTokenData, webPoSignalOutput: WebPoSignalOutput) {
    const getMinter = webPoSignalOutput[0];

    if (!getMinter)
      throw new Error('PMD:Undefined');

    const mintCallback = await getMinter(base64ToU8(integrityTokenResponse.integrityToken ?? ''));

    if (!(mintCallback instanceof Function))
      throw new Error('APF:Failed');

    return new WebPoMinter(mintCallback);
  }

  public async mintAsWebsafeString(identifier: string): Promise<string> {
    const result = await this.mint(identifier);
    return u8ToBase64(result, true);
  }

  public async mint(identifier: string): Promise<Uint8Array> {
    const result = await this.mintCallback(new TextEncoder().encode(identifier));

    if (!result)
      throw new Error('YNJ:Undefined');

    if (!(result instanceof Uint8Array))
      throw new Error('ODM:Invalid');

    return result;
  }
}