import type { RegisteredHike } from '@mountain-hut/shared';
import type { Hike } from '../domain/hike.js';

// A stored hike as the API returns it: the hut's local date and time split into their parts.
export const toRegisteredHike = (hike: Hike): RegisteredHike => ({
  id: hike.id,
  destination: hike.destination,
  route: hike.route,
  passagePoints: hike.passagePoints,
  departureDate: hike.departureAt.slice(0, 10),
  departureTime: hike.departureAt.slice(11, 16),
  returnDate: hike.returnAt.slice(0, 10),
  returnTime: hike.returnAt.slice(11, 16),
  predefinedHikeId: hike.predefinedHikeId,
});
