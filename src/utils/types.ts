export type PoTokenArgs = {
  program: string;
  bgConfig: BgConfig;
  globalName: string;
};

export type PoTokenResult = {
  poToken: string;
  integrityTokenData: IntegrityTokenData;
};

export type PostProcessFunction = (buffer: Uint8Array) => Promise<(identifier: Uint8Array) => Promise<Uint8Array | undefined>>;

export type IntegrityTokenData = {
  integrityToken?: string;
  estimatedTtlSecs?: number;
  mintRefreshThreshold?: number;
  websafeFallbackToken?: string;
};

export type BotguardResponse = {
  integrityTokenData: IntegrityTokenData;
  postProcessFunctions: (PostProcessFunction | undefined)[];
};

export type InterpreterJavascript = {
  privateDoNotAccessOrElseSafeScriptWrappedValue: string | null;
}

export type DescrambledChallenge = {
  /**
   * The ID of the JSPB message.
   */
  messageId?: string;
  /**
   * The script associated with the challenge.
   */
  interpreterJavascript: InterpreterJavascript;
  /**
   * The hash of the script.
  */
  interpreterHash: string;
  /**
   * The program.
   */
  program: string;
  /**
   * The name of the VM in the global scope.
  */
  globalName: string;
  /**
   * The client experiments state blob.
  */
  clientExperimentsStateBlob?: string;
};

export type FetchFunction = typeof fetch;

export type BgConfig = {
  fetch: FetchFunction;
  globalObj: Record<string, any>;
  identifier: string;
  requestKey: string;
};
