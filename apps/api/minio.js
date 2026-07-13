const { Client } = require("minio");
const { config } = require("./runtime-config");

const s3Endpoint = new URL(config.S3_ENDPOINT);
const s3EndpointPort = s3Endpoint.port
  ? Number.parseInt(s3Endpoint.port, 10)
  : s3Endpoint.protocol === "https:"
    ? 443
    : 80;

const minioClient = new Client({
  endPoint: s3Endpoint.hostname,
  port: s3EndpointPort,
  useSSL: s3Endpoint.protocol === "https:",
  accessKey: config.S3_ACCESS_KEY,
  secretKey: config.S3_SECRET_KEY,
  region: config.S3_REGION,
  pathStyle: config.S3_FORCE_PATH_STYLE,
});

const BUCKET = config.S3_BUCKET;

async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, config.S3_REGION);
    console.log(`Created bucket: ${BUCKET}`);
  }

  // Replace legacy public policies with explicit no-grants policy.
  const policy = {
    Version: "2012-10-17",
    Statement: [],
  };
  await minioClient.setBucketPolicy(BUCKET, JSON.stringify(policy));
}

module.exports = { ensureBucket, minioClient, BUCKET };
