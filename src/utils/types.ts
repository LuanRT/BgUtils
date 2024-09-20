export type PoTokenArgs = {
  program: string;
  bgConfig: BgConfig;
  globalName: string;
};

export type PostProcessFunction = (buffer: Uint8Array) => Promise<(identifier: Uint8Array) => Promise<Uint8Array | undefined>>;

export type BotguardResponse = {
  postProcessFunctions: (PostProcessFunction | undefined)[];
  integrityToken: string;
};

export type DescrambledChallenge = {
  /**
   * The script associated with the challenge.
   */
  script?: (string | null)[];
  /**
   * The hash of the script.
   */
  interpreterHash: string;
  /**
   * The name of the VM in the global scope.
   */
  globalName: string;
  /**
   * The program / challenge.
   */
  challenge: string;
  /**
   * The ID of the JSPB message.
   */
  messageId: string;
};

export type FetchFunction = typeof fetch;

export type BgConfig = {
  fetch: FetchFunction;
  globalObj: Record<string, any>;
  identifier: string;
  requestKey: string;
};
