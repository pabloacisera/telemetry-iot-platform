import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { LandingPage } from '../pages/LandingPage';
import { authSlice } from '../store/auth.slice';
import { motorsSlice } from '../store/motors.slice';
import { alertsSlice } from '../store/alerts.slice';
import { ragSlice } from '../store/rag.slice';
import { api } from '../services/api';

function createStore() {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      motors: motorsSlice.reducer,
      alerts: alertsSlice.reducer,
      rag: ragSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: null,
        accessToken: null,
        loading: false,
        refreshAttempted: true,
        error: null,
      },
    },
  });
}

function renderLanding() {
  return render(
    <Provider store={createStore()}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('LandingPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the brand, hero and key sections', () => {
    renderLanding();

    expect(screen.getAllByText('Telemetry IoT Platform').length).toBeGreaterThan(0);
    expect(screen.getByText(/Prevení fallas en tus motores/)).toBeInTheDocument();
    expect(screen.getAllByText('Beneficios para tu planta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cómo funciona').length).toBeGreaterThan(0);
    expect(screen.getByText('Así se ve la plataforma')).toBeInTheDocument();
    expect(screen.getByText(/¿Listo para proteger tu planta?/)).toBeInTheDocument();
  });

  it('links to the login page when unauthenticated', () => {
    renderLanding();
    expect(screen.getAllByRole('link', { name: 'Ingresar' }).length).toBeGreaterThan(0);
  });

  it('subscribes the email via POST /landing/subscribe and shows success', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { subscribed: true, email: 'cliente@planta.com', firstTime: true },
    });
    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByLabelText('Correo electrónico'), 'cliente@planta.com');
    await user.click(screen.getByRole('button', { name: 'Solicitar acceso' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/landing/subscribe', {
        email: 'cliente@planta.com',
      });
    });
    expect(await screen.findByText('¡Listo!')).toBeInTheDocument();
    expect(screen.getByText(/Revisá tu bandeja de entrada/)).toBeInTheDocument();
    expect(screen.getByText(/spam\/no deseado/)).toBeInTheDocument();
    expect(screen.getByText('cliente@planta.com')).toBeInTheDocument();
  }, 15000);

  it('shows an error message when the subscription request fails', async () => {
    (api.post as jest.Mock).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByLabelText('Correo electrónico'), 'cliente@planta.com');
    await user.click(screen.getByRole('button', { name: 'Solicitar acceso' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos registrar/);
  }, 15000);

  it('shows a specific message when the backend responds 409', async () => {
    (api.post as jest.Mock).mockRejectedValue({
      response: { status: 409, data: { message: 'Ya existe una cuenta con este correo' } },
    });
    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByLabelText('Correo electrónico'), 'cliente@planta.com');
    await user.click(screen.getByRole('button', { name: 'Solicitar acceso' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Ya tenés acceso con este correo/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/spam/);
  }, 15000);
});
