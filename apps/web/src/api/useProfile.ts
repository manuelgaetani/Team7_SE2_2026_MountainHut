import { useQuery } from '@tanstack/react-query';
import { fetchMyProfile } from './profile.ts';

// The user id is part of the key: after a sign out, the next user never sees the profile of the
// previous one, not even for a moment.
export function useMyProfile(userId: number) {
  return useQuery({ queryKey: ['profile', userId] as const, queryFn: fetchMyProfile });
}
