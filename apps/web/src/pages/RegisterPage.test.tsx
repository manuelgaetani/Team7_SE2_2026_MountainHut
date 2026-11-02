import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSchema } from '@mountain-hut/shared';
import { json, renderAt, sentBody, stubApi, user } from '../test/app.tsx';

const required = {
  'Full name': 'Test Hiker',
  Email: user.email,
  Phone: '+39 333 1234567',
  Password: 'Password123',
};

const fill = (fields: Record<string, string>) => {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Register' }));

describe('RegisterPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows an error for each required field and does not call the API', () => {
    const fetchMock = stubApi();
    renderAt('/register');
    submit();
    expect(
      screen.getByText('Enter your full name (it must contain a letter).'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(
      screen.getByText('Enter 7 to 15 digits. Spaces, dashes and a leading + are allowed.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Use at least 8 characters with a letter and a digit/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/register', expect.anything());
  });

  it('keeps the first message of a field and handles unknown fields', () => {
    stubApi();
    const issues = [
      { path: ['notes'] },
      { path: ['notes'] },
      { path: ['emergencyContact'] },
      { path: ['other'] },
    ];
    vi.spyOn(registerSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { issues },
    } as never);
    renderAt('/register');
    submit();
    expect(screen.getAllByText('The notes are not valid.')).toHaveLength(1);
    expect(screen.getByText('The emergency contact is not valid.')).toBeInTheDocument();
  });

  it('sends only the filled fields and goes to the login page', async () => {
    const fetchMock = stubApi({ '/api/auth/register': () => json(user, 201) });
    const router = renderAt('/register');
    fill(required);
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(sentBody(fetchMock, '/api/auth/register')).toEqual({
      email: user.email,
      password: required.Password,
      fullName: required['Full name'],
      phone: required.Phone,
    });
  });

  it('sends the optional fields when they are filled', async () => {
    const fetchMock = stubApi({ '/api/auth/register': () => json(user, 201) });
    const router = renderAt('/register');
    fill({
      ...required,
      'Emergency contact (optional)': 'Anna +39 333 0000000',
      'Notes (optional)': 'Vegetarian',
    });
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(sentBody(fetchMock, '/api/auth/register')).toMatchObject({
      emergencyContact: 'Anna +39 333 0000000',
      notes: 'Vegetarian',
    });
  });

  it('explains that the email is already registered', async () => {
    stubApi({ '/api/auth/register': () => json({}, 409) });
    renderAt('/register');
    fill(required);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });

  it('shows a generic error for any other failure', async () => {
    stubApi({ '/api/auth/register': () => json({}, 500) });
    renderAt('/register');
    fill(required);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Registration failed');
  });

  it('shows that the request is running', async () => {
    const fetchMock = stubApi();
    fetchMock.mockImplementation((url: string) =>
      url === '/api/auth/register' ? new Promise(() => undefined) : Promise.resolve(json({}, 401)),
    );
    renderAt('/register');
    fill(required);
    submit();
    expect(await screen.findByRole('button', { name: 'Registering…' })).toBeDisabled();
  });
});
