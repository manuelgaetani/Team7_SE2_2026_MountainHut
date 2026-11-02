import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { HealthStatus } from '@mountain-hut/shared';
import { apiGet } from '../api/client.ts';
import { useCurrentUser } from '../api/useAuth.ts';

export function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthStatus>('/health'),
  });
  const { data: user, isPending } = useCurrentUser();

  return (
    <>
      <section className="hero">
        <div className="section">
          <p className="eyebrow">Mountain hut</p>
          <h1>Closer to the sky.</h1>
          <p className="lead">
            A simple place to rest, eat and set off again. Plan your stop with confidence.
          </p>
          {!isPending && !user && (
            <Link to="/register" className="button-primary button-primary--inline">
              <span>Register to book a table</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </section>
      <p className="api-status">
        API status:{' '}
        {health.isPending ? 'checking…' : health.isError ? 'unreachable' : health.data.status}
      </p>
    </>
  );
}
