
/**
 * @typedef {typeof fetch} FetchFunction
 */

/**
 * @typedef {{ 
 *  fetch: FetchFunction;
 *  globalObj: Record<string, any>;
 *  visitorData: string;
 *  requestKey: string;
 * }} BgConfig
 */

export * as PoToken from './potoken.mjs';
export * as Challenge from './challenge.mjs';