import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { api } from '../services/api';

describe('ForgotPasswordPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
  }

  it('renders the email form', () => {
    renderPage();
    expect(screen.getByText('Restablecer contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  });

  it('posts the email and shows the generic confirmation', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { message: 'ok' } });
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText('Correo electrónico'),
      'cliente@planta.com',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/password/forgot', {
        email: 'cliente@planta.com',
      });
    });
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument();
    expect(screen.getByText(/Si existe una cuenta con/)).toBeInTheDocument();
  }, 15000);

  it('shows an error when the request fails', async () => {
    (api.post as jest.Mock).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText('Correo electrónico'),
      'cliente@planta.com',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Network error/);
  }, 15000);
});

describe('ResetPasswordPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows an invalid-link message when the token is missing', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Enlace inválido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar un nuevo enlace' })).toBeInTheDocument();
  });

  it('posts the new password and shows success', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { message: 'ok' } });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc-123']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Nueva contraseña'), 'NuevaClave123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'NuevaClave123');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/password/reset', {
        token: 'abc-123',
        newPassword: 'NuevaClave123',
      });
    });
    expect(await screen.findByText('¡Listo!')).toBeInTheDocument();
  }, 15000);

  it('shows an error when the passwords do not match', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc-123']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Nueva contraseña'), 'ClaveUno123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveDos456');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Las contraseñas no coinciden/,
    );
    expect(api.post).not.toHaveBeenCalled();
  });
});
