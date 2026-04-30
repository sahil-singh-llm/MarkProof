export function stringifyJsonRecord(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
}

export function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}
