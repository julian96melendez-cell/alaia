'use strict';
const BASE = '/api/ordenes/admin/reconciliation';
function pathname(req) {
  const raw = typeof req.originalUrl === 'string' ? req.originalUrl : '';
  if (raw.startsWith('/')) return raw.split(/[?#]/, 1)[0];
  // Absolute-form targets: discard authority without parsing attacker host/port.
  // The authority may be malformed; no input fragment becomes a logged route.
  const absolute = raw.replace(/\\/g, '/').match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/);
  return absolute?.[1] || '';
}
function isReconciliationRequest(req) {
  return /^\/api\/ordenes\/admin\/reconciliation(?:\/|$)/i.test(pathname(req));
}
function reconciliationLogEntry(req, status) {
  const path = pathname(req).slice(BASE.length);
  const route = /^\/?$/.test(path) ? BASE
    : /^\/[^/]+\/?$/.test(path) ? BASE + '/:caseKey'
    : /^\/[^/]+\/reviews\/?$/i.test(path) ? BASE + '/:caseKey/reviews'
    : BASE + '/:unmatched';
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
  return { method, route, status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null };
}
const allowedCodes = new Set(['REVIEW_INVALID_INPUT', 'REVIEW_INVALID_REFERENCE', 'REVIEW_AMBIGUOUS_QUERY', 'REVIEW_READ_TIMEOUT', 'REVIEW_READ_BUSY', 'REVIEW_UNAVAILABLE', 'REVIEW_AUTH_ERROR']);
const parserCodes = Object.freeze({ 'entity.parse.failed': 'REQUEST_BODY_INVALID', 'entity.too.large': 'REQUEST_BODY_TOO_LARGE', 'encoding.unsupported': 'REQUEST_ENCODING_UNSUPPORTED' });
function reconciliationErrorLog(req, status, error) {
  const code = allowedCodes.has(error?.publicCode) ? error.publicCode
    : typeof error?.type === 'string' && Object.hasOwn(parserCodes, error.type) ? parserCodes[error.type]
    : error?.message === 'Origin no permitido por CORS' ? 'REQUEST_ORIGIN_FORBIDDEN'
    : 'REVIEW_HTTP_ERROR';
  return { ...reconciliationLogEntry(req, status), code };
}
function reconciliationLogFormat(_tokens, req, res) {
  return JSON.stringify(reconciliationLogEntry(req, res.headersSent ? res.statusCode : null));
}
module.exports = { isReconciliationRequest, reconciliationLogFormat, reconciliationErrorLog };
