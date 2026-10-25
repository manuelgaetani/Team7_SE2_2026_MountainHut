import { useQuery } from '@tanstack/react-query';
import type { HealthStatus } from '@mountain-hut/shared';
import { apiGet } from '../api/client.ts';

export function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthStatus>('/health'),
  });

  return (
    <section>
      <h1>Welcome</h1>
      <p>
        API status:{' '}
        {health.isPending ? 'checking…' : health.isError ? 'unreachable' : health.data.status}
      </p>
    </section>
  );
}
