const { Client } = require("minio");
const { config } = require("./runtime-config");

const s3Endpoint = new URL(config.S3_ENDPOINT);
const publicEndpoint = (config.S3_PUBLIC_ENDPOINT || config.S3_ENDPOINT).replace(/\/$/, "");
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

  // Set public-read bucket policy so browser can GET images directly
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      },
    ],
  };
  await minioClient.setBucketPolicy(BUCKET, JSON.stringify(policy));
}

/**
 * Generate a presigned URL for uploading a file to MinIO.
 * @param {string} key - Object key (path) in the bucket
 * @param {string} contentType - MIME type of the file
 * @param {number} [expiry=3600] - URL expiry in seconds (default 1 hour)
 * @returns {Promise<{uploadUrl: string, publicUrl: string, key: string}>}
 */
async function getPresignedUploadUrl(key, contentType, expiry = 3600) {
  await ensureBucket();

  const uploadUrl = await minioClient.presignedPutObject(BUCKET, key, expiry);
  const publicUploadHost = new URL(publicEndpoint).host;
  const publicUploadUrl = uploadUrl.replace(s3Endpoint.host, publicUploadHost);
  const publicUrl = new URL(`${BUCKET}/${key}`, `${publicEndpoint}/`).toString();

  return { uploadUrl: publicUploadUrl, publicUrl, key };
}

module.exports = { getPresignedUploadUrl, ensureBucket, minioClient, BUCKET };
