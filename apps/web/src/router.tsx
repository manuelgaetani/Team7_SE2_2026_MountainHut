import { createBrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { AvailabilityPage } from './pages/AvailabilityPage.tsx';
import { BookingPage } from './pages/BookingPage.tsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.tsx';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { MyBookingsPage } from './pages/MyBookingsPage.tsx';
import { MyHikesPage } from './pages/MyHikesPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { RegisterHikePage } from './pages/RegisterHikePage.tsx';
import { ResetPasswordPage } from './pages/ResetPasswordPage.tsx';
import { SlotsPage } from './pages/SlotsPage.tsx';
import { StaffBookingPage } from './pages/StaffBookingPage.tsx';
import { StaffHikesPage } from './pages/StaffHikesPage.tsx';
import { UnauthorizedPage } from './pages/UnauthorizedPage.tsx';
import { FloorPlanPage } from './pages/FloorPlanPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ProfileLayout } from './components/ProfileLayout.tsx';

export const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'book', element: <BookingPage /> },
      { path: 'availability', element: <AvailabilityPage /> },
      { path: 'hikes/new', element: <RegisterHikePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      // The personal area: one layout with a side menu, the old addresses kept.
      {
        element: <ProfileLayout />,
        children: [
          { path: 'profile', element: <ProfilePage /> },
          { path: 'bookings', element: <MyBookingsPage /> },
          { path: 'hikes', element: <MyHikesPage /> },
          { path: 'change-password', element: <ChangePasswordPage /> },
        ],
      },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'staff/slots', element: <SlotsPage /> },
      { path: 'staff/bookings/new', element: <StaffBookingPage /> },
      { path: 'staff/slots/:id/floor', element: <FloorPlanPage /> },
      { path: 'staff/hikes', element: <StaffHikesPage /> },
      { path: 'unauthorized', element: <UnauthorizedPage /> },
      { path: 'forbidden', element: <UnauthorizedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
