const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_SERIALIZED_LENGTH = 64 * 1024;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 32) {
    throw new Error('JSON record exceeds maximum nesting depth.');
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue;
    }

    result[key] = sanitize(child, depth + 1);
  }

  return result;
}

export function stringifyJsonRecord(value: Record<string, unknown> | undefined): string {
  const sanitized = sanitize(value ?? {}) as Record<string, unknown>;
  const serialized = JSON.stringify(sanitized);

  if (serialized.length > MAX_SERIALIZED_LENGTH) {
    throw new Error(
      `Serialized JSON record must be at most ${MAX_SERIALIZED_LENGTH} bytes (got ${serialized.length}).`
    );
  }

  return serialized;
}

export function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return sanitize(parsed) as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}
