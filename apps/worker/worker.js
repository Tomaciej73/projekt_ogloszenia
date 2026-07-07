require("dotenv").config();

const { Queue, Worker } = require("bullmq");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6739";

// Publication queue
const publicationQueue = new Queue("publication", {
  connection: { url: REDIS_URL },
});

// Worker that processes publication jobs
const worker = new Worker(
  "publication",
  async (job) => {
    console.log(`Processing publication job ${job.id}:`, job.data);

    // Simulate external API call with mock connector
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      externalId: `mock-${Date.now()}`,
      externalUrl: `https://mock.example.com/${Date.now()}`,
      status: "published",
    };
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

async function addPublicationJob(listingId, accountId, draft) {
  const job = await publicationQueue.add(
    "publish",
    { listingId, accountId, draft },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    }
  );
  return { jobId: job.id, status: "queued" };
}

console.log("Worker started, processing 'publication' queue");
console.log(`Redis: ${REDIS_URL}`);

module.exports = { addPublicationJob, publicationQueue };