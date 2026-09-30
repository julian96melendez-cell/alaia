"use strict";

// Lazy loading keeps middleware unit tests independent of real credentials.
function createFirebaseAuth(getAuth = () => require("../config/firebaseAdmin").admin.auth()) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || "");
    if (!match) return res.status(401).json({ ok: false, message: "Sesión Firebase requerida" });
    try {
      const decoded = await getAuth().verifyIdToken(match[1], true);
      if (!decoded.uid) throw new Error("Missing uid");
      req.firebaseUser = { uid: decoded.uid, email: decoded.email || "" };
      return next();
    } catch {
      return res.status(401).json({ ok: false, message: "Sesión Firebase inválida o expirada" });
    }
  };
}

module.exports = { verificarFirebase: createFirebaseAuth(), createFirebaseAuth };
