import { createBrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { BookingPage } from './pages/BookingPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { SlotsPage } from './pages/SlotsPage.tsx';
import { UnauthorizedPage } from './pages/UnauthorizedPage.tsx';
import { FloorPlanPage } from './pages/FloorPlanPage.tsx';

export const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'book', element: <BookingPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'staff/slots', element: <SlotsPage /> },
      { path: 'staff/slots/:id/floor', element: <FloorPlanPage /> },
      { path: 'unauthorized', element: <UnauthorizedPage /> },
      { path: 'forbidden', element: <UnauthorizedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
