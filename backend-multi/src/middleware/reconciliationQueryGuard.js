'use strict';

// Inspect raw, decoded names before HPP or Mongo sanitization can collapse them.
// This router supports scalar query parameters only, never bracket notation.
function rejectAmbiguousReconciliationQuery(req, res, next) {
  const url = req.originalUrl;
  const question = url.indexOf('?');
  const seen = new Set();
  for (const [name] of new URLSearchParams(question < 0 ? '' : url.slice(question + 1))) {
    if (seen.has(name) || /[\[\]]/.test(name)) {
      res.set('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, code: 'REVIEW_AMBIGUOUS_QUERY', financialActionsAllowed: false });
    }
    seen.add(name);
  }
  return next();
}

module.exports = { rejectAmbiguousReconciliationQuery };
