import { Qe, j } from '../utils/index.mjs';

/**
 * Creates a placeholder PoToken. This can be used while `sps` (StreamProtectionStatus) is 2, but will not work once it changes to 3.
 * @param {string} input - The input to encode and generate the token.
 * @returns {string}
 */
export function create(input) {
  return Qe(j(new TextEncoder().encode(input)), 2);
}