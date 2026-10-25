import { Outlet } from 'react-router';

export function App() {
  return (
    <>
      <header>
        <strong>Mountain Hut</strong>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
