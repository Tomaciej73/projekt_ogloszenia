const MEDIA_PROXY_PREFIX = "/media-files";

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeObjectKey(value) {
  if (typeof value !== "string") return null;

  const segments = value
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodePathSegment);

  if (
    segments.length === 0 ||
    segments.some((segment) => (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      /[\\\u0000-\u001F\u007F]/.test(segment)
    ))
  ) {
    return null;
  }

  return segments.join("/");
}

function encodePathSegments(value) {
  const key = normalizeObjectKey(value);
  return key ? key.split("/").map((segment) => encodeURIComponent(segment)).join("/") : null;
}

function buildMediaProxyPath(key, bucket) {
  const encodedKey = encodePathSegments(key);
  if (!bucket || !encodedKey) return null;

  return `${MEDIA_PROXY_PREFIX}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

function extractMediaObjectKey(rawUrl, bucket) {
  if (typeof rawUrl !== "string" || !bucket) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const encodedBucket = encodeURIComponent(bucket);
  const proxyPrefix = `${MEDIA_PROXY_PREFIX}/${encodedBucket}/`;
  const bucketPrefix = `/${encodedBucket}/`;
  const directBucketPrefix = `${encodedBucket}/`;

  if (trimmed.startsWith(proxyPrefix)) {
    return normalizeObjectKey(trimmed.slice(proxyPrefix.length));
  }

  if (trimmed.startsWith(directBucketPrefix)) {
    return normalizeObjectKey(trimmed.slice(directBucketPrefix.length));
  }

  try {
    const parsed = new URL(trimmed, "http://placeholder.local");
    if (parsed.pathname.startsWith(proxyPrefix)) {
      return normalizeObjectKey(parsed.pathname.slice(proxyPrefix.length));
    }
    if (parsed.pathname.startsWith(bucketPrefix)) {
      return normalizeObjectKey(parsed.pathname.slice(bucketPrefix.length));
    }
  } catch {
    return null;
  }

  return null;
}

module.exports = {
  MEDIA_PROXY_PREFIX,
  buildMediaProxyPath,
  extractMediaObjectKey,
  normalizeObjectKey,
};
