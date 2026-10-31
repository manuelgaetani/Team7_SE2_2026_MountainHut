import { Outlet } from 'react-router';
import { NavBar } from './components/NavBar.tsx';

export function App() {
  return (
    <>
      <header>
        <NavBar />
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}