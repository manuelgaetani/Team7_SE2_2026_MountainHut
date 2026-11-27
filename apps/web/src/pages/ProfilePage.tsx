import { Navigate } from 'react-router';
import type { AuthUser } from '@mountain-hut/shared';
import { isStaff, ROLE_LABEL } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useMyProfile } from '../api/useProfile.ts';

type Field = { label: string; value: string | null };

function Details({ fields }: { fields: Field[] }) {
  return (
    <dl className="my-profile__card">
      {fields.map((f) => (
        <div key={f.label} className="my-profile__field">
          <dt>{f.label}</dt>
          <dd>{f.value || 'Not provided'}</dd>
        </div>
      ))}
    </dl>
  );
}

// Name, email and phone of the hiker. Optional details left empty at registration show as
// "Not provided".
function HikerDetails({ userId }: { userId: number }) {
  const profileQuery = useMyProfile(userId);

  if (profileQuery.isPending) return <p role="status">Loading your profile…</p>;
  if (profileQuery.isError) {
    return (
      <p role="alert" className="notice notice--error">
        Your profile could not be loaded.
      </p>
    );
  }
  const profile = profileQuery.data;
  return (
    <Details
      fields={[
        { label: 'Full name', value: profile.fullName },
        { label: 'Email', value: profile.email },
        { label: 'Phone', value: profile.phone },
      ]}
    />
  );
}

// A staff account has no hiker profile: only the account itself.
function StaffDetails({ user }: { user: AuthUser }) {
  return (
    <Details
      fields={[
        { label: 'Email', value: user.email },
        { label: 'Role', value: ROLE_LABEL[user.role] },
      ]}
    />
  );
}

export function ProfilePage() {
  const { data: user, isPending } = useCurrentUser();

  // A visitor without a session has no profile: the page for visitors not signed in.
  if (!isPending && !user) return <Navigate to="/unauthorized" replace />;
  if (!user) return null;

  return (
    <section aria-labelledby="my-profile-title">
      <h1 id="my-profile-title" className="profile__title">
        My profile
      </h1>
      {isStaff(user) ? <StaffDetails user={user} /> : <HikerDetails userId={user.id} />}
    </section>
  );
}
