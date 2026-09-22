"use strict";

const { admin, firestore } = require("../config/firebaseAdmin");

const FULFILLMENT_TO_APP_STATUS = {
  pendiente: "pendiente_pago",
  procesando: "en_preparacion",
  enviado: "en_camino",
  entregado: "entregada",
  cancelado: "cancelada",
};

const PAYMENT_TO_APP_STATUS = {
  pendiente: "pendiente",
  pagado: "pagado",
  fallido: "fallido",
  reembolsado: "reembolsado",
  reembolsado_parcial: "reembolsado",
};

const STATUS_TITLES = {
  pendiente_pago: "Orden pendiente",
  confirmada: "Orden confirmada",
  en_preparacion: "En preparación",
  en_camino: "En camino",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

const STATUS_DESCRIPTIONS = {
  pendiente_pago: "La orden está pendiente de pago.",
  confirmada: "La orden fue confirmada.",
  en_preparacion: "Estamos preparando la orden.",
  en_camino: "La orden está en camino.",
  entregada: "La orden fue entregada correctamente.",
  cancelada: "La orden fue cancelada.",
};

function safeStr(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function getFirebaseUserIdFromOrden(orden) {
  return (
    safeStr(orden?.userId) ||
    safeStr(orden?.firebaseUserId) ||
    safeStr(orden?.usuarioFirebaseId) ||
    safeStr(orden?.usuario?.firebaseUid) ||
    safeStr(orden?.usuario?.uid) ||
    ""
  );
}

function getFirestoreOrderIdFromOrden(orden) {
  return (
    safeStr(orden?.orderId) ||
    safeStr(orden?.firestoreOrderId) ||
    safeStr(orden?.clienteOrderId) ||
    ""
  );
}

async function findFirestoreOrderRefsFromMongoOrden(orden) {
  const paymentIntentId = safeStr(orden?.stripePaymentIntentId);
  const firestoreOrderId = getFirestoreOrderIdFromOrden(orden);
  const firebaseUserId = getFirebaseUserIdFromOrden(orden);

  if (firestoreOrderId) {
    const globalRef = firestore.collection("orders").doc(firestoreOrderId);
    const globalSnap = await globalRef.get();

    if (globalSnap.exists) {
      const data = globalSnap.data() || {};
      const userId = firebaseUserId || safeStr(data.userId);

      if (userId) {
        return {
          orderId: firestoreOrderId,
          userId,
          globalRef,
          userRef: firestore
            .collection("users")
            .doc(userId)
            .collection("orders")
            .doc(firestoreOrderId),
        };
      }
    }
  }

  if (firebaseUserId && paymentIntentId) {
    const userSnap = await firestore
      .collection("users")
      .doc(firebaseUserId)
      .collection("orders")
      .where("stripePaymentIntentId", "==", paymentIntentId)
      .limit(1)
      .get();

    if (!userSnap.empty) {
      const docSnap = userSnap.docs[0];

      return {
        orderId: docSnap.id,
        userId: firebaseUserId,
        globalRef: firestore.collection("orders").doc(docSnap.id),
        userRef: docSnap.ref,
      };
    }
  }

  if (paymentIntentId) {
    const globalSnap = await firestore
      .collection("orders")
      .where("stripePaymentIntentId", "==", paymentIntentId)
      .limit(1)
      .get();

    if (!globalSnap.empty) {
      const docSnap = globalSnap.docs[0];
      const data = docSnap.data() || {};
      const userId = firebaseUserId || safeStr(data.userId);

      if (userId) {
        return {
          orderId: docSnap.id,
          userId,
          globalRef: docSnap.ref,
          userRef: firestore
            .collection("users")
            .doc(userId)
            .collection("orders")
            .doc(docSnap.id),
        };
      }
    }
  }

  return null;
}

async function syncFirestoreOrderFromAdmin({
  orden,
  estadoPago,
  estadoFulfillment,
  reqId,
  adminId,
}) {
  const refs = await findFirestoreOrderRefsFromMongoOrden(orden);

  if (!refs) {
    console.log("FIRESTORE ADMIN ORDER SYNC SKIPPED:", {
      reason: "firestore_order_not_found",
      mongoOrdenId: safeStr(orden?._id),
      stripePaymentIntentId: safeStr(orden?.stripePaymentIntentId),
      reqId,
    });
    return false;
  }

  const appStatus = estadoFulfillment
    ? FULFILLMENT_TO_APP_STATUS[estadoFulfillment]
    : null;

  const appPaymentStatus = estadoPago ? PAYMENT_TO_APP_STATUS[estadoPago] : null;

  const update = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminUpdatedBy: safeStr(adminId) || null,
    adminReqId: safeStr(reqId) || null,
  };

  if (appStatus) {
    update.status = appStatus;
    update["tracking.currentStep"] = appStatus;
    update["tracking.history"] = admin.firestore.FieldValue.arrayUnion({
      status: appStatus,
      title: STATUS_TITLES[appStatus] || "Estado actualizado",
      description:
        STATUS_DESCRIPTIONS[appStatus] || "El estado de la orden fue actualizado.",
      createdAt: new Date().toISOString(),
      source: "admin",
    });
  }

  if (appPaymentStatus) {
    update.paymentStatus = appPaymentStatus;
  }

  const batch = firestore.batch();
  batch.set(refs.globalRef, update, { merge: true });
  batch.set(refs.userRef, update, { merge: true });
  await batch.commit();

  console.log("FIRESTORE ADMIN ORDER SYNC OK:", {
    orderId: refs.orderId,
    userId: refs.userId,
    status: appStatus,
    paymentStatus: appPaymentStatus,
    reqId,
  });

  return true;
}

module.exports = {
  syncFirestoreOrderFromAdmin,
};