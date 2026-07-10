require("dotenv").config();

const { Queue } = require("bullmq");
const { config } = require("./runtime-config");

async function main() {
  const queue = new Queue("publication", {
    connection: { url: config.REDIS_URL },
  });

  try {
    await queue.waitUntilReady();
  } finally {
    await queue.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
