import { describe, expect, it } from 'vitest';

import {
  buildFileDateCandidate,
  extractDateCandidatesFromExif,
  extractDateCandidatesFromText
} from '../src/main/parsing/dates';

describe('date extraction', () => {
  it('extracts deterministic dates from common proof-of-use text formats', () => {
    const candidates = extractDateCandidatesFromText(
      [
        'Invoice date: 2024-03-15',
        'Delivery: 16.03.2024',
        'Campaign ran on 2024/03/17.',
        'Published 18 March 2024.',
        'Foto vom 19. März 2024.'
      ].join('\n')
    );

    expect(candidates.map((candidate) => candidate.candidateDate)).toEqual([
      '2024-03-15',
      '2024-03-16',
      '2024-03-17',
      '2024-03-18',
      '2024-03-19'
    ]);
  });

  it('rejects invalid and ambiguous dates', () => {
    const candidates = extractDateCandidatesFromText(
      'Impossible: 31.02.2024. Ambiguous: 03/04/2024. Unambiguous: 13/04/2024.'
    );

    expect(candidates).toEqual([
      {
        candidateDate: '2024-04-13',
        rawValue: '13/04/2024',
        source: 'pdf_text'
      }
    ]);
  });

  it('deduplicates identical source/date/raw triples', () => {
    const candidates = extractDateCandidatesFromText('2024-03-15 and 2024-03-15');

    expect(candidates).toEqual([
      {
        candidateDate: '2024-03-15',
        rawValue: '2024-03-15',
        source: 'pdf_text'
      }
    ]);
  });

  it('extracts EXIF date-like values from metadata records', () => {
    const candidates = extractDateCandidatesFromExif({
      DateTimeOriginal: '2024:05:10 10:30:00',
      CreateDate: new Date('2024-05-11T08:00:00.000Z'),
      CameraModel: 'ExampleCam 1'
    });

    expect(candidates).toEqual([
      {
        candidateDate: '2024-05-10',
        rawValue: 'DateTimeOriginal: 2024:05:10 10:30:00',
        source: 'exif'
      },
      {
        candidateDate: '2024-05-11',
        rawValue: '2024-05-11T08:00:00.000Z',
        source: 'exif'
      }
    ]);
  });

  it('builds file timestamp candidates without throwing on missing values', () => {
    expect(buildFileDateCandidate(null, 'file_created')).toBeNull();
    expect(buildFileDateCandidate('2024-06-01T12:00:00.000Z', 'file_modified')).toEqual({
      candidateDate: '2024-06-01',
      rawValue: '2024-06-01T12:00:00.000Z',
      source: 'file_modified'
    });
  });
});
