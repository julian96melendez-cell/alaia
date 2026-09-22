"use strict";

const { admin, firestore } = require("../config/firebaseAdmin");

function safeStr(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function getUserIdFromStripeObject(obj = {}) {
  return (
    safeStr(obj?.metadata?.userId) ||
    safeStr(obj?.metadata?.usuarioId) ||
    safeStr(obj?.metadata?.uid) ||
    safeStr(obj?.metadata?.firebaseUserId)
  );
}

function getMetadataOrderIdFromStripeObject(obj = {}) {
  return safeStr(obj?.metadata?.orderId) || safeStr(obj?.metadata?.ordenId);
}

function getPaymentIntentIdFromStripeObject(obj = {}) {
  return (
    safeStr(obj?.payment_intent) ||
    safeStr(obj?.id?.startsWith?.("pi_") ? obj.id : "") ||
    safeStr(obj?.payment_intent_details?.payment_intent)
  );
}

async function findFirestoreOrder({ userId, metadataOrderId, paymentIntentId }) {
  if (userId && paymentIntentId) {
    const userOrdersRef = firestore
      .collection("users")
      .doc(userId)
      .collection("orders");

    const byPi = await userOrdersRef
      .where("stripePaymentIntentId", "==", paymentIntentId)
      .limit(1)
      .get();

    if (!byPi.empty) {
      const doc = byPi.docs[0];
      return {
        orderId: doc.id,
        userOrderRef: doc.ref,
        globalOrderRef: firestore.collection("orders").doc(doc.id),
      };
    }
  }

  if (metadataOrderId) {
    const globalRef = firestore.collection("orders").doc(metadataOrderId);
    const globalSnap = await globalRef.get();

    if (globalSnap.exists) {
      const data = globalSnap.data() || {};
      const finalUserId = userId || safeStr(data.userId);

      if (finalUserId) {
        return {
          orderId: metadataOrderId,
          userOrderRef: firestore
            .collection("users")
            .doc(finalUserId)
            .collection("orders")
            .doc(metadataOrderId),
          globalOrderRef: globalRef,
        };
      }
    }
  }

  return null;
}

async function updateFirestoreOrderFromStripe({
  stripeObject,
  status,
  paymentStatus,
  eventId,
  detail,
}) {
  const userId = getUserIdFromStripeObject(stripeObject);
  const metadataOrderId = getMetadataOrderIdFromStripeObject(stripeObject);
  const paymentIntentId = getPaymentIntentIdFromStripeObject(stripeObject);

  const found = await findFirestoreOrder({
    userId,
    metadataOrderId,
    paymentIntentId,
  });

  if (!found) {
    console.log("FIRESTORE ORDER SYNC SKIPPED:", {
      reason: "order_not_found",
      userId,
      metadataOrderId,
      paymentIntentId,
      eventId,
    });
    return false;
  }

  const update = {
    status,
    paymentStatus,
    stripePaymentIntentId: paymentIntentId || null,
    stripeLatestEventId: safeStr(eventId),
    paymentStatusDetail: safeStr(detail),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    "tracking.currentStep": status,
    "tracking.history": admin.firestore.FieldValue.arrayUnion({
      status,
      title:
        paymentStatus === "pagado"
          ? "Pago confirmado"
          : paymentStatus === "fallido"
          ? "Pago fallido"
          : paymentStatus === "reembolsado"
          ? "Pago reembolsado"
          : "Pago actualizado",
      description: safeStr(detail),
      createdAt: new Date().toISOString(),
    }),
  };

  const batch = firestore.batch();

  batch.set(found.globalOrderRef, update, { merge: true });
  batch.set(found.userOrderRef, update, { merge: true });

  await batch.commit();

  console.log("FIRESTORE ORDER SYNC OK:", {
    orderId: found.orderId,
    userId,
    metadataOrderId,
    paymentIntentId,
    status,
    paymentStatus,
    eventId,
  });

  return true;
}

module.exports = {
  updateFirestoreOrderFromStripe,
}; 