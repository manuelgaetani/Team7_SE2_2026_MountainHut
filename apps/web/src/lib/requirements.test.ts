import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS_LENGTH } from '@mountain-hut/shared';
import {
  draftError,
  draftErrors,
  emptyDraft,
  isFilled,
  sameRequirements,
  toDraft,
  toRequirement,
  type RequirementDraft,
} from './requirements.ts';

const draft = (patch: Partial<RequirementDraft>): RequirementDraft => ({
  ...emptyDraft(1),
  ...patch,
});

describe('toRequirement', () => {
  it('sends the needs in the order of the list of the hut', () => {
    const r = toRequirement(draft({ restrictions: ['VEGAN', 'GLUTEN_FREE'] }));
    expect(r).toEqual({
      restrictions: ['GLUTEN_FREE', 'VEGAN'],
      allergies: false,
      description: '',
    });
  });

  it('trims the free text and keeps its allergy flag', () => {
    const r = toRequirement(draft({ other: true, description: '  shellfish ', allergies: true }));
    expect(r).toEqual({ restrictions: [], allergies: true, description: 'shellfish' });
  });

  it('drops the free text and its flag when Other is unticked', () => {
    const r = toRequirement(
      draft({ restrictions: ['EGG_FREE'], other: false, description: 'kiwi', allergies: true }),
    );
    expect(r).toEqual({ restrictions: ['EGG_FREE'], allergies: false, description: '' });
  });
});

describe('toDraft', () => {
  it('ticks Other for a saved free text', () => {
    expect(toDraft({ restrictions: [], allergies: true, description: 'kiwi' }, 3)).toEqual({
      key: 3,
      restrictions: [],
      other: true,
      allergies: true,
      description: 'kiwi',
    });
  });

  it('leaves Other unticked for listed needs only', () => {
    expect(toDraft({ restrictions: ['VEGAN'], allergies: false, description: '' }, 1).other).toBe(
      false,
    );
  });
});

describe('draftError', () => {
  it('asks to pick a need on an empty entry', () => {
    expect(draftError(draft({}))).toBe('Choose at least one need, or remove this requirement.');
  });

  it.each(['', '   '])('asks to describe the other need when it is %j', (description) => {
    expect(draftError(draft({ restrictions: ['VEGAN'], other: true, description }))).toBe(
      'Describe the other need, or untick Other.',
    );
  });

  it('accepts a free text of exactly the maximum length, rejects one more', () => {
    const at = draft({ other: true, description: 'a'.repeat(MAX_REQUIREMENTS_LENGTH) });
    const over = draft({ other: true, description: 'a'.repeat(MAX_REQUIREMENTS_LENGTH + 1) });
    expect(draftError(at)).toBeNull();
    expect(draftError(over)).toBe(
      `A requirement can be at most ${MAX_REQUIREMENTS_LENGTH} characters.`,
    );
  });

  it('accepts listed needs alone', () => {
    expect(draftError(draft({ restrictions: ['SOY_FREE'] }))).toBeNull();
    expect(isFilled(draft({ restrictions: ['SOY_FREE'] }))).toBe(true);
  });

  it('keys the errors by row', () => {
    const rows = [draft({ key: 1, restrictions: ['VEGAN'] }), draft({ key: 2 })];
    expect(Object.keys(draftErrors(rows))).toEqual(['2']);
  });
});

describe('sameRequirements', () => {
  const a = { restrictions: ['VEGAN' as const], allergies: false, description: '' };

  it('compares the needs, the flag and the text', () => {
    expect(sameRequirements([a], [{ ...a, restrictions: ['VEGAN'] }])).toBe(true);
    expect(sameRequirements([a], [{ ...a, restrictions: ['EGG_FREE'] }])).toBe(false);
    expect(sameRequirements([a], [{ ...a, restrictions: [] }])).toBe(false);
    expect(sameRequirements([a], [{ ...a, description: 'x' }])).toBe(false);
    expect(sameRequirements([a], [])).toBe(false);
  });
});
