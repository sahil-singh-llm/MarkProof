import { describe, expect, it } from 'vitest';

import { LEGAL_DISCLAIMER } from '../src/shared/constants/disclaimer';

describe('legal disclaimer', () => {
  it('matches the required wording exactly', () => {
    expect(LEGAL_DISCLAIMER).toBe(
      'This tool organizes evidence. It does not determine legal sufficiency. Always consult a qualified trademark attorney.'
    );
  });
});
