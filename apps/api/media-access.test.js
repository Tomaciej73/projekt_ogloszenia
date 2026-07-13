const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMediaProxyPath, extractMediaObjectKey } = require("./media-access");

const bucket = "listing-media";
const key = "uploads/user-123/photo one.jpg";

test("media paths round-trip through the same-origin proxy route", () => {
  const path = buildMediaProxyPath(key, bucket);

  assert.equal(path, "/media-files/listing-media/uploads/user-123/photo%20one.jpg");
  assert.equal(extractMediaObjectKey(path, bucket), key);
  assert.equal(extractMediaObjectKey(`https://app.example${path}`, bucket), key);
  assert.equal(extractMediaObjectKey(`${bucket}/uploads/user-123/photo%20one.jpg`, bucket), key);
});

test("media paths reject traversal, malformed encoding, and another bucket", () => {
  assert.equal(extractMediaObjectKey("/media-files/listing-media/uploads/%2E%2E/secret.jpg", bucket), null);
  assert.equal(extractMediaObjectKey("/media-files/listing-media/uploads/%2Fsecret.jpg", bucket), null);
  assert.equal(extractMediaObjectKey("/media-files/listing-media/uploads/%ZZ.jpg", bucket), null);
  assert.equal(extractMediaObjectKey("/media-files/other-bucket/uploads/photo.jpg", bucket), null);
});
