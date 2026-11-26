// A moment in the hut's local time, as 'YYYY-MM-DDTHH:MM' (hikeMoment in @mountain-hut/shared).
// Two moments compare as strings.
export type LocalMoment = string;

export interface NewHike {
  hikerId: number;
  predefinedHikeId: number | null;
  destination: string;
  route: string;
  passagePoints: string[];
  departureAt: LocalMoment;
  returnAt: LocalMoment;
}

export interface Hike extends NewHike {
  id: number;
}

export interface HikeHikerContact {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
}

export interface HikeWithHiker extends Hike {
  hiker: HikeHikerContact;
}
