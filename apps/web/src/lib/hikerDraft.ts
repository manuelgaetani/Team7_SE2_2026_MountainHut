import type { HikerProfile } from '@mountain-hut/shared';

// EXISTING: a hiker already in the system. TEMPORARY: quick entry, no web access.
// ACCOUNT: a regular hiker with a full profile and web access.
export type HikerMode = 'EXISTING' | 'TEMPORARY' | 'ACCOUNT';

export interface HikerDraft {
  mode: HikerMode;
  search: string;
  selected: HikerProfile | null;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
  emergencyContact: string;
}

export const emptyHikerDraft = (): HikerDraft => ({
  mode: 'EXISTING',
  search: '',
  selected: null,
  fullName: '',
  email: '',
  phone: '',
  notes: '',
  emergencyContact: '',
});

export type FieldErrors = Partial<Record<string, string>>;
