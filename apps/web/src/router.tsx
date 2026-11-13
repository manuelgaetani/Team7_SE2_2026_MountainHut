import { createBrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { AvailabilityPage } from './pages/AvailabilityPage.tsx';
import { BookingPage } from './pages/BookingPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { SlotsPage } from './pages/SlotsPage.tsx';
import { UnauthorizedPage } from './pages/UnauthorizedPage.tsx';

export const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'book', element: <BookingPage /> },
      { path: 'availability', element: <AvailabilityPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'staff/slots', element: <SlotsPage /> },
      { path: 'unauthorized', element: <UnauthorizedPage /> },
      { path: 'forbidden', element: <UnauthorizedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
