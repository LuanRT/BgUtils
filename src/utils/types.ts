export type MintCallback = (contentBinding: Uint8Array) => Promise<Uint8Array | undefined>;
export type WebPoSignalOutputFunction = (buffer: Uint8Array) => Promise<(contentBinding: Uint8Array) => Promise<Uint8Array | undefined>>;
export type WebPoSignalOutput = (WebPoSignalOutputFunction | undefined)[];
export type FetchFunction = typeof fetch;

export type BgEventData = { event: string; elapsedTime: number; };
export type ClientErrorData = { errorCode: number; };
export type PayloadSizeData = { payloadSize: number; };
export type LatencyData = { latency: number; et: number; };
export type EventCountData = { event: string; };

export type BotGuardClientOptions = {
  program?: string;
  globalName?: string;
  globalObject?: any;
  userInteractionElement?: any;
};

export type ChallengeFetcherConfig = {
  requestKey: string;
  interpreterHash?: string;
  fetchFunction: FetchFunction;
  useYouTubeAPI?: boolean;
};

export type VMFunctions = {
  asyncSnapshotFunction?: (callback: (str: string) => void, args: any[]) => string;
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

export type SnapshotArgs = {
  contentBinding?: ContentBiding;
  signedTimestamp?: unknown;
  webPoSignalOutput?: WebPoSignalOutput;
  skipPrivacyBuffer?: boolean;
};

export type IntegrityTokenData = {
  integrityToken?: string;
  estimatedTtlSecs?: number;
  mintRefreshThreshold?: number;
  websafeFallbackToken?: string;
};

export interface IWebutilHtmlTypesSafeScriptProto {
  privateDoNotAccessOrElseSafeScriptWrappedValue?: string;
}

export interface IWebutilHtmlTypesTrustedResourceUrlProto {
  privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string;
}

export interface IBotguardClientSideBgChallenge {
  messageId?: string;
  clientExperimentsStateBlob?: string;
  globalName?: string;
  interpreterHash?: string;
  interpreterJavascript?: IWebutilHtmlTypesSafeScriptProto;
  interpreterUrl?: IWebutilHtmlTypesTrustedResourceUrlProto;
  program?: string;
}