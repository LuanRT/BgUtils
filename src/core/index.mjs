
/**
 * @typedef {typeof fetch} FetchFunction
 */

/**
 * @typedef {{ 
 *  fetch: FetchFunction;
 *  globalObj: Record<string, any>;
 *  visitorData: string;
 *  clientId: string;
 * }} BgConfig
 */

export * as PoToken from './potoken.mjs';
export * as Challenge from './challenge.mjs';
export * as SessionToken from './sessionToken.mjs';