const SENSITIVE_AUDIT_KEY = /(?:pass(?:word)?|token|secret|authorization|cookie|credential|reset.*code|access.*token|refresh.*token|private.*key|api.*key)/i;
const MAX_AUDIT_METADATA_DEPTH = 3;
const MAX_AUDIT_METADATA_ENTRIES = 20;
const MAX_AUDIT_METADATA_ARRAY_ITEMS = 10;
const MAX_AUDIT_METADATA_TEXT_LENGTH = 256;

function sanitizeAuditMetadata(value, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, MAX_AUDIT_METADATA_TEXT_LENGTH);
  if (depth >= MAX_AUDIT_METADATA_DEPTH || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_AUDIT_METADATA_ARRAY_ITEMS)
      .map((item) => sanitizeAuditMetadata(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_AUDIT_METADATA_ENTRIES)) {
    if (SENSITIVE_AUDIT_KEY.test(key)) continue;
    const normalizedValue = sanitizeAuditMetadata(nestedValue, depth + 1);
    if (normalizedValue !== undefined) sanitized[key] = normalizedValue;
  }
  return sanitized;
}

module.exports = { sanitizeAuditMetadata };
