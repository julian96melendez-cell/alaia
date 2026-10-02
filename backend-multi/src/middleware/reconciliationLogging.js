'use strict';
const BASE = '/api/ordenes/admin/reconciliation';
const { parse } = require('node:url');
// Match Express' pathname handling, including absolute-form HTTP targets.
const pathname = req => parse(req.originalUrl).pathname || '';
function isReconciliationRequest(req) {
  return /^\/api\/ordenes\/admin\/reconciliation(?:\/|$)/i.test(pathname(req));
}
function reconciliationLogFormat(_tokens, req, res) {
  const path = pathname(req).slice(BASE.length);
  const route = /^\/?$/.test(path) ? BASE
    : /^\/[^/]+\/?$/.test(path) ? BASE + '/:caseKey'
    : /^\/[^/]+\/reviews\/?$/i.test(path) ? BASE + '/:caseKey/reviews'
    : BASE + '/:unmatched';
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
  // No URLs, query, IDs, headers, IPs, user agents, referrers or request IDs.
  return JSON.stringify({ method, route, status: res.headersSent ? res.statusCode : null });
}
module.exports = { isReconciliationRequest, reconciliationLogFormat };
