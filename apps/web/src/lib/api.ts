const apiBaseUrl = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
