"use strict";

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function getServiceAccount() {
  // Producción / Render
  const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (envServiceAccount) {
    try {
      const serviceAccount = JSON.parse(envServiceAccount);

      if (serviceAccount.private_key) {
        serviceAccount.private_key =
          serviceAccount.private_key.replace(/\\n/g, "\n");
      }

      console.log(
        "🔥 Firebase Admin: usando credenciales desde variable de entorno"
      );

      return serviceAccount;
    } catch (err) {
      console.error(
        "❌ FIREBASE_SERVICE_ACCOUNT_JSON inválido:",
        err?.message
      );

      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON no contiene un JSON válido"
      );
    }
  }

  // Desarrollo local
  const localServiceAccountPath = path.join(
    process.cwd(),
    "serviceAccountKey.json"
  );

  if (fs.existsSync(localServiceAccountPath)) {
    console.log(
      "🔥 Firebase Admin: usando serviceAccountKey.json local"
    );

    return require(localServiceAccountPath);
  }

  throw new Error(
    "No se encontraron credenciales de Firebase Admin. " +
      "Configura FIREBASE_SERVICE_ACCOUNT_JSON o usa serviceAccountKey.json localmente."
  );
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = admin.firestore();

module.exports = {
  admin,
  firestore,
};