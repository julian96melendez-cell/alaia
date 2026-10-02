"use strict";
const { proteger, soloAdmin } = require("../middleware/auth");
const { createAdminReconciliationController, requireReviewOrigin } = require("../controllers/adminReconciliationController");
function createAdminReconciliationRouter({ readHandlers, controller = createAdminReconciliationController(), auth = { proteger, soloAdmin }, express = require("express") } = {}) {
  const router = express.Router();
  const selected = readHandlers || controller;
  router.use(auth.proteger, auth.soloAdmin);
  router.get("/", selected.list);
  router.get("/:caseKey", selected.detail);
  router.post("/:caseKey/reviews", requireReviewOrigin, controller.review);
  return router;
}
// Backward-compatible default; construction opens no connections.
module.exports = createAdminReconciliationRouter();
module.exports.createAdminReconciliationRouter = createAdminReconciliationRouter;
