import { base64ToU8, BgError, u8ToBase64 } from '../utils/helpers.js';
import type { IntegrityTokenData, MintCallback, WebPoSignalOutput } from '../utils/types.js';

/**
 * Represents a Web Proof of Origin Token minter.
 */
export class WebPoMinter {
  private readonly mintCallback: MintCallback;

  constructor(mintCallback: MintCallback) {
    this.mintCallback = mintCallback;
  }

  /**
   * Factory method to create a WebPoMinter instance.
   * @param integrityTokenResponse - The integrity token response object.
   * @param webPoSignalOutput - The output array containing the minter function.
   */
  public static async create(
    integrityTokenResponse: IntegrityTokenData,
    webPoSignalOutput: WebPoSignalOutput
  ): Promise<WebPoMinter> {
    const getMinter = webPoSignalOutput[0];

    if (!getMinter)
      throw new BgError('PMD:Undefined');

    if (!integrityTokenResponse.integrityToken)
      throw new BgError('No integrity token provided', { integrityTokenResponse });

    const mintCallback = await getMinter(base64ToU8(integrityTokenResponse.integrityToken));

    if (!(mintCallback instanceof Function))
      throw new BgError('APF:Failed');

    return new WebPoMinter(mintCallback);
  }

  /**
   * Mints a proof and returns it as a web-safe base64 string.
   * @param contentBinding - A Visitor ID, Video ID, or Data Sync ID.
   */
  public async mintAsWebsafeString(contentBinding: string): Promise<string> {
    return u8ToBase64(await this.mint(contentBinding), true);
  }

  /**
   * Mints a proof and returns it as a Uint8Array.
   * @param contentBinding - A Visitor ID, Video ID, or Data Sync ID.
   */
  public async mint(contentBinding: string): Promise<Uint8Array> {
    const result = await this.mintCallback(new TextEncoder().encode(contentBinding));

    if (!result)
      throw new BgError('YNJ:Undefined');

    if (!(result instanceof Uint8Array))
      throw new BgError('ODM:Invalid');

    return result;
  }
}

/**
 * Creates a cold start token. This can be used while `sps` (StreamProtectionStatus) is 2, but will not work once it changes to 3.
 * @param contentBinding - A Visitor ID, Video ID, or Data Sync ID.
 * @param clientState - An integer representing the client state. Defaults to 1.
 */
export function createColdStartToken(contentBinding: string, clientState?: number): string {
  const contentBindingBytes = new TextEncoder().encode(contentBinding);
  const timestamp = Math.floor(Date.now() / 1000);
  const randomKeys = [ Math.floor(Math.random() * 256), Math.floor(Math.random() * 256) ];

  // NOTE: The "0" value before the client state is supposed to be someVal & 0xFF.
  // It is always 0 though, so I didn't bother investigating further.
  const header = randomKeys.concat(
    [
      0, (clientState ?? 1)
    ],
    [
      (timestamp >> 24) & 0xFF,
      (timestamp >> 16) & 0xFF,
      (timestamp >> 8) & 0xFF,
      timestamp & 0xFF
    ]
  );

  const packet = new Uint8Array(2 + header.length + contentBindingBytes.length);

  packet[0] = 34;
  packet[1] = header.length + contentBindingBytes.length;

  packet.set(header, 2);
  packet.set(contentBindingBytes, 2 + header.length);

  const payload = packet.subarray(2);

  const keyLength = randomKeys.length;

  for (let i = keyLength; i < payload.length; i++) {
    payload[i] ^= payload[i % keyLength];
  }

  return u8ToBase64(packet, true);
}

export interface ContentBindingData {
  contentBinding: string;
  timestamp: number;
  unknownVal: number;
  clientState: number;
  keys: number[];
  date: Date;
};

/**
 * Decodes a cold start token.
 * @param token - The cold start token to decode.
 */
export function decodeColdStartToken(token: string): ContentBindingData {
  const packet = base64ToU8(token);

  const payloadLength = packet[1];
  const totalPacketLength = 2 + payloadLength;

  if (packet.length !== totalPacketLength)
    throw new BgError('Invalid packet length.', { packetLength: packet.length, expectedLength: totalPacketLength });

  const payload = packet.subarray(2);

  // Decrypt the payload by reversing the XOR operation.
  const keyLength = 2;
  for (let i = keyLength; i < payload.length; ++i) {
    payload[i] ^= payload[i % keyLength];
  }

  const keys = [ payload[0], payload[1] ];

  const unknownVal = payload[2]; // This is the masked prop mentioned in the function above.
  const clientState = payload[3];

  const timestamp =
    (payload[4] << 24) |
    (payload[5] << 16) |
    (payload[6] << 8) |
    payload[7];

  const date = new Date(timestamp * 1000);
  const contentBinding = new TextDecoder().decode(payload.subarray(8));

  return {
    contentBinding,
    timestamp,
    unknownVal,
    clientState,
    keys,
    date
  };
}
