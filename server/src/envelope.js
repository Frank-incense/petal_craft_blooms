/**
 * Response envelopes. Identical in shape to apps-script/Utils.js so the
 * frontend's api.js works unchanged:
 *
 *   { success: true,  data, message }
 *   { success: false, error, code }
 */

/** An expected failure the client should see (bad input, not found, …). */
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Lets a handler set the envelope's `message` alongside its data. */
export function ok(data, message) {
  return { [RESULT]: true, data, message };
}

const RESULT = Symbol('result');

export function successBody(result) {
  if (result && result[RESULT]) {
    return { success: true, data: result.data === undefined ? {} : result.data, message: result.message || 'Success' };
  }
  return { success: true, data: result === undefined ? {} : result, message: 'Success' };
}

export function errorBody(message, code) {
  return { success: false, error: message || 'Unknown error', code: code || 'ERROR' };
}
