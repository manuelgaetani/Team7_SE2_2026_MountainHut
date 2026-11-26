import {
  DIETARY_OPTIONS,
  MAX_REQUIREMENTS_LENGTH,
  type DietaryCode,
  type PartyRequirement,
} from '@mountain-hut/shared';

// A requirement as edited in the form. The key only identifies the row in the list.
export interface RequirementDraft {
  key: number;
  // Needs picked from the list of the hut.
  restrictions: DietaryCode[];
  // "Other" is ticked: the free text field is shown and sent.
  other: boolean;
  // The free text is an allergy or intolerance.
  allergies: boolean;
  description: string;
}

export const emptyDraft = (key: number): RequirementDraft => ({
  key,
  restrictions: [],
  other: false,
  allergies: false,
  description: '',
});

// A saved requirement back in the form: "Other" is ticked when it has a free text.
export const toDraft = (r: PartyRequirement, key: number): RequirementDraft => ({
  key,
  restrictions: [...r.restrictions],
  other: r.description !== '',
  allergies: r.allergies,
  description: r.description,
});

// What the API stores: the needs in the order of the list, the free text trimmed and only
// when "Other" is ticked, and the allergies flag only for a free text.
export function toRequirement(d: RequirementDraft): PartyRequirement {
  const description = d.other ? d.description.trim() : '';
  return {
    restrictions: DIETARY_OPTIONS.map((o) => o.code).filter((c) => d.restrictions.includes(c)),
    allergies: description !== '' && d.allergies,
    description,
  };
}

// The message shown under a row that cannot be sent; null when the row is fine.
export function draftError(d: RequirementDraft): string | null {
  const length = d.description.trim().length;
  if (d.other && length === 0) return 'Describe the other need, or untick Other.';
  if (d.other && length > MAX_REQUIREMENTS_LENGTH) {
    return `A requirement can be at most ${MAX_REQUIREMENTS_LENGTH} characters.`;
  }
  if (!d.other && d.restrictions.length === 0) {
    return 'Choose at least one need, or remove this requirement.';
  }
  return null;
}

// The errors of the rows that cannot be sent, keyed by row.
export function draftErrors(rows: RequirementDraft[]): Partial<Record<number, string>> {
  const found: Partial<Record<number, string>> = {};
  for (const row of rows) {
    const error = draftError(row);
    if (error) found[row.key] = error;
  }
  return found;
}

// True when the row already says something: a picked need or some free text.
export const isFilled = (d: RequirementDraft): boolean => draftError(d) === null;

export const sameRequirements = (a: PartyRequirement[], b: PartyRequirement[]): boolean =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.allergies === b[i].allergies &&
      r.description === b[i].description &&
      r.restrictions.length === b[i].restrictions.length &&
      r.restrictions.every((c, j) => c === b[i].restrictions[j]),
  );
