export type PoTokenArgs = {
  program: string;
  bgConfig: BgConfig;
  globalName: string;
};

export type PoTokenResult = {
  poToken: string;
  integrityTokenData: IntegrityTokenData;
};

export type MintCallback = (identifier: Uint8Array) => Promise<Uint8Array | undefined>;
export type WebPoSignalOutputFunction = (buffer: Uint8Array) => Promise<(identifier: Uint8Array) => Promise<Uint8Array | undefined>>
export type WebPoSignalOutput = (WebPoSignalOutputFunction | undefined)[];

export type BotGuardClientOptions = {
  program: string;
  globalName: string;
  globalObj: Record<string, any>;
  userInteractionElement?: Record<string, any>;
}

export type VMFunctions = {
  asyncSnapshotFunction?: (callback: (str: string) => void, args: any[]) => Promise<string>;
  shutdownFunction?: (...args: any[]) => void;
  passEventFunction?: (...args: any[]) => void;
  checkCameraFunction?: (...args: any[]) => void;
};

export type ContentBiding = {
  c?: string;
  e?: string;
  encryptedVideoId?: string;
  externalChannelId?: string;
  commentId?: string;
  atr_challenge?: string;
  [key: string]: any;
};

// @TODO: Figure out the correct types for the rest of these arguments.
export type SnapshotArgs = {
  contentBinding?: ContentBiding;
  signedTimestamp?: unknown;
  webPoSignalOutput?: WebPoSignalOutput;
  skipPrivacyBuffer?: unknown;
};

export type IntegrityTokenData = {
  integrityToken?: string;
  estimatedTtlSecs?: number;
  mintRefreshThreshold?: number;
  websafeFallbackToken?: string;
};

export type InterpreterJavascript = {
  privateDoNotAccessOrElseSafeScriptWrappedValue: string | null;
  privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: string | null;
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
  useYouTubeAPI?: boolean;
};
