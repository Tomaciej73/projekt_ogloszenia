const { Client } = require("minio");

// MinIO client — all config from environment variables
const minioClient = new Client({
  endPoint: (process.env.S3_ENDPOINT || "http://localhost:9000").replace(/https?:\/\//, "").replace(/:\d+$/, ""),
  port: parseInt((process.env.S3_ENDPOINT || "http://localhost:9000").match(/:(\d+)$/)?.[1] || "9000", 10),
  useSSL: false,
  accessKey: process.env.S3_ACCESS_KEY || "minio_admin",
  secretKey: process.env.S3_SECRET_KEY || "",
  region: process.env.S3_REGION || "us-east-1",
});

const BUCKET = process.env.S3_BUCKET || "multiportal-media";

async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, process.env.S3_REGION || "us-east-1");
    console.log(`Created bucket: ${BUCKET}`);
  }
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

  const publicUrl = `http://localhost:${process.env.MINIO_API_PORT || 9000}/${BUCKET}/${key}`;

  return { uploadUrl, publicUrl, key };
}

module.exports = { getPresignedUploadUrl, ensureBucket, minioClient, BUCKET };