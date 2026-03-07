const { Queue } = require("bullmq");
const { getRedisConnection } = require("./redis");

const connection = getRedisConnection();

const emailQueue = new Queue("email-queue", {
  connection,
  defaultJobOptions: {
    attempts: Number(process.env.EMAIL_JOB_ATTEMPTS || 6),
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 2000,
    removeOnFail: 5000,
  },
});

async function enqueueEmail(jobName, payload) {
  return emailQueue.add(jobName, payload, {
    jobId: payload?.idempotencyKey || undefined, // ✅ idempotencia por jobId
  });
}

module.exports = { emailQueue, enqueueEmail };