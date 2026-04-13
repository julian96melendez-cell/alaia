const { paymentQueue } = require("../services/queue");

async function enqueuePagoConfirmado(data) {
  await paymentQueue.add(
    "pago-confirmado",
    data,
    {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

module.exports = {
  enqueuePagoConfirmado,
};