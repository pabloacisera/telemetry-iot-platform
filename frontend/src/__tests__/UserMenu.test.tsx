import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { UserMenu } from '../components/UserMenu';
import { authSlice } from '../store/auth.slice';
import { motorsSlice } from '../store/motors.slice';
import { alertsSlice } from '../store/alerts.slice';
import { ragSlice } from '../store/rag.slice';
import { api } from '../services/api';

type TestStore = ReturnType<typeof createStore>;

function createStore(role = 'admin', email = 'test@test.com') {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      motors: motorsSlice.reducer,
      alerts: alertsSlice.reducer,
      rag: ragSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: { userId: 1, email, role },
        accessToken: 'fake-token',
        loading: false,
        refreshAttempted: true,
        error: null,
      },
    },
  });
}

function createAnonymousStore() {
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

function renderMenu(store: TestStore) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    </Provider>,
  );
}

describe('UserMenu', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when unauthenticated', () => {
    const { container } = renderMenu(createAnonymousStore());
    expect(container.firstChild).toBeNull();
  });

  it('shows the user email and role label', () => {
    renderMenu(createStore('admin', 'admin@plant.io'));
    expect(screen.getByText('admin@plant.io')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('calls POST /auth/logout and clears the session on click', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { message: 'Logged out' } });
    const store = createStore();
    const user = userEvent.setup();
    renderMenu(store);

    await user.click(screen.getByTitle('Cerrar sesión'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/logout');
      expect(store.getState().auth.user).toBeNull();
      expect(store.getState().auth.accessToken).toBeNull();
    });
  });

  it('clears the session even when the logout request fails', async () => {
    (api.post as jest.Mock).mockRejectedValue(new Error('Network error'));
    const store = createStore();
    const user = userEvent.setup();
    renderMenu(store);

    await user.click(screen.getByTitle('Cerrar sesión'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/logout');
      expect(store.getState().auth.user).toBeNull();
      expect(store.getState().auth.accessToken).toBeNull();
    });
  });
});
