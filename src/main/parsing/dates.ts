import type { EvidenceDateCandidateSource } from '@shared/types/evidence';

export type ExtractedDateCandidate = {
  candidateDate: string;
  source: EvidenceDateCandidateSource;
  rawValue: string;
};

const ISO_DATE_PATTERN = /\b(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})\b/g;
const ISO_SLASH_DATE_PATTERN = /\b(?<year>\d{4})\/(?<month>\d{1,2})\/(?<day>\d{1,2})\b/g;
const DOTTED_DATE_PATTERN = /\b(?<day>\d{1,2})\.(?<month>\d{1,2})\.(?<year>\d{4})\b/g;
const SLASH_DATE_PATTERN = /\b(?<first>\d{1,2})\/(?<second>\d{1,2})\/(?<year>\d{4})\b/g;
const EXIF_DATE_PATTERN =
  /\b(?<year>\d{4}):(?<month>\d{2}):(?<day>\d{2})(?:[ T](?<time>\d{2}:\d{2}:\d{2}))?\b/g;
const MONTH_NAME_PATTERN =
  /\b(?<day>\d{1,2})\.?\s+(?<month>[A-Za-z\u00c0-\u017f]+)\s+(?<year>\d{4})\b/g;

const MONTHS = new Map<string, number>([
  ['januar', 1],
  ['jan', 1],
  ['january', 1],
  ['februar', 2],
  ['feb', 2],
  ['february', 2],
  ['maerz', 3],
  ['marz', 3],
  ['mrz', 3],
  ['march', 3],
  ['mar', 3],
  ['april', 4],
  ['apr', 4],
  ['mai', 5],
  ['may', 5],
  ['juni', 6],
  ['jun', 6],
  ['june', 6],
  ['juli', 7],
  ['jul', 7],
  ['july', 7],
  ['august', 8],
  ['aug', 8],
  ['september', 9],
  ['sep', 9],
  ['sept', 9],
  ['oktober', 10],
  ['okt', 10],
  ['october', 10],
  ['oct', 10],
  ['november', 11],
  ['nov', 11],
  ['dezember', 12],
  ['dez', 12],
  ['december', 12],
  ['dec', 12]
]);

type ParsedDateParts = {
  year: number;
  month: number;
  day: number;
};

function normalizeMonthName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.$/, '');
}

function toInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) {
    return null;
  }

  return Number(value);
}

function toIsoDate(parts: ParsedDateParts): string | null {
  if (parts.year < 1900 || parts.year > 2100 || parts.month < 1 || parts.month > 12) {
    return null;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }

  const month = parts.month.toString().padStart(2, '0');
  const day = parts.day.toString().padStart(2, '0');

  return `${parts.year}-${month}-${day}`;
}

function fromGroups(groups: Record<string, string | undefined>): string | null {
  const year = toInteger(groups.year);
  const month = toInteger(groups.month);
  const day = toInteger(groups.day);

  if (year === null || month === null || day === null) {
    return null;
  }

  return toIsoDate({ year, month, day });
}

function addCandidate(
  candidates: ExtractedDateCandidate[],
  source: EvidenceDateCandidateSource,
  rawValue: string,
  candidateDate: string | null
): void {
  if (!candidateDate) {
    return;
  }

  candidates.push({
    candidateDate,
    source,
    rawValue: rawValue.trim()
  });
}

function collectPatternMatches(
  candidates: ExtractedDateCandidate[],
  text: string,
  pattern: RegExp,
  source: EvidenceDateCandidateSource
): void {
  for (const match of text.matchAll(pattern)) {
    addCandidate(candidates, source, match[0], fromGroups(match.groups ?? {}));
  }
}

function dedupeCandidates(candidates: readonly ExtractedDateCandidate[]): ExtractedDateCandidate[] {
  const seen = new Set<string>();
  const deduped: ExtractedDateCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.source}\0${candidate.candidateDate}\0${candidate.rawValue}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  }

  return deduped.sort((a, b) => {
    const byDate = a.candidateDate.localeCompare(b.candidateDate);

    if (byDate !== 0) {
      return byDate;
    }

    const bySource = a.source.localeCompare(b.source);

    return bySource !== 0 ? bySource : a.rawValue.localeCompare(b.rawValue);
  });
}

export function extractDateCandidatesFromText(
  text: string,
  source: EvidenceDateCandidateSource = 'pdf_text'
): ExtractedDateCandidate[] {
  const candidates: ExtractedDateCandidate[] = [];

  collectPatternMatches(candidates, text, ISO_DATE_PATTERN, source);
  collectPatternMatches(candidates, text, ISO_SLASH_DATE_PATTERN, source);
  collectPatternMatches(candidates, text, DOTTED_DATE_PATTERN, source);
  collectPatternMatches(candidates, text, EXIF_DATE_PATTERN, source);

  for (const match of text.matchAll(SLASH_DATE_PATTERN)) {
    const first = toInteger(match.groups?.first);
    const second = toInteger(match.groups?.second);
    const year = toInteger(match.groups?.year);

    if (first === null || second === null || year === null) {
      continue;
    }

    // Accept unambiguous slash dates only. Ambiguous values remain review-only.
    const parts =
      first > 12
        ? { day: first, month: second, year }
        : second > 12
          ? { day: second, month: first, year }
          : null;

    if (parts) {
      addCandidate(candidates, source, match[0], toIsoDate(parts));
    }
  }

  for (const match of text.matchAll(MONTH_NAME_PATTERN)) {
    const day = toInteger(match.groups?.day);
    const year = toInteger(match.groups?.year);
    const monthName = match.groups?.month;
    const month = monthName ? MONTHS.get(normalizeMonthName(monthName)) : undefined;

    if (day !== null && year !== null && month !== undefined) {
      addCandidate(candidates, source, match[0], toIsoDate({ year, month, day }));
    }
  }

  return dedupeCandidates(candidates);
}

export function extractDateCandidatesFromExif(
  exif: Record<string, unknown>
): ExtractedDateCandidate[] {
  const candidates: ExtractedDateCandidate[] = [];

  for (const [key, value] of Object.entries(exif)) {
    if (!/(date|time|created|modified|original)/i.test(key)) {
      continue;
    }

    if (value instanceof Date) {
      addCandidate(candidates, 'exif', value.toISOString(), value.toISOString().slice(0, 10));
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      candidates.push(
        ...extractDateCandidatesFromText(String(value), 'exif').map((candidate) => ({
          ...candidate,
          rawValue: `${key}: ${candidate.rawValue}`
        }))
      );
    }
  }

  return dedupeCandidates(candidates);
}

export function buildFileDateCandidate(
  value: Date | string | null | undefined,
  source: Extract<EvidenceDateCandidateSource, 'file_created' | 'file_modified'>
): ExtractedDateCandidate | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    candidateDate: date.toISOString().slice(0, 10),
    source,
    rawValue: date.toISOString()
  };
}
