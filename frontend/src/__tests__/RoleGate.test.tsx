import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { RoleGate } from '../components/routes/RoleGate';
import { authSlice } from '../store/auth.slice';
import { motorsSlice } from '../store/motors.slice';
import { alertsSlice } from '../store/alerts.slice';
import { ragSlice } from '../store/rag.slice';

/** Create a test store with a specific user role. */
function createStoreWithRole(role: string | null) {
  const store = configureStore({
    reducer: {
      auth: authSlice.reducer,
      motors: motorsSlice.reducer,
      alerts: alertsSlice.reducer,
      rag: ragSlice.reducer,
    },
    preloadedState: {
      auth: {
        user: role ? { userId: 1, email: 'test@test.com', role } : null,
        accessToken: role ? 'fake-token' : null,
        loading: false,
        error: null,
      },
    },
  });
  return store;
}

function renderWithRole(role: string | null, minimumRole: 'viewer' | 'operator' | 'admin') {
  const store = createStoreWithRole(role);
  return render(
    <Provider store={store}>
      <RoleGate minimumRole={minimumRole}>
        <button>Protected Action</button>
      </RoleGate>
    </Provider>,
  );
}

describe('RoleGate', () => {
  describe('admin user', () => {
    it('should show content requiring admin role', () => {
      renderWithRole('admin', 'admin');
      expect(screen.getByText('Protected Action')).toBeInTheDocument();
    });

    it('should show content requiring operator role', () => {
      renderWithRole('admin', 'operator');
      expect(screen.getByText('Protected Action')).toBeInTheDocument();
    });

    it('should show content requiring viewer role', () => {
      renderWithRole('admin', 'viewer');
      expect(screen.getByText('Protected Action')).toBeInTheDocument();
    });
  });

  describe('operator user', () => {
    it('should NOT show content requiring admin role', () => {
      renderWithRole('operator', 'admin');
      expect(screen.queryByText('Protected Action')).not.toBeInTheDocument();
    });

    it('should show content requiring operator role', () => {
      renderWithRole('operator', 'operator');
      expect(screen.getByText('Protected Action')).toBeInTheDocument();
    });

    it('should show content requiring viewer role', () => {
      renderWithRole('operator', 'viewer');
      expect(screen.getByText('Protected Action')).toBeInTheDocument();
    });
  });

  describe('viewer user', () => {
    it('should NOT show content requiring admin role', () => {
      renderWithRole('viewer', 'admin');
      expect(screen.queryByText('Protected Action')).not.toBeInTheDocument();
    });

    it('should NOT show content requiring operator role', () => {
      renderWithRole('viewer', 'operator');
      expect(screen.queryByText('Protected Action')).not.toBeInTheDocument();
    });

    it('should show content requiring viewer role', () => {
      renderWithRole('viewer', 'viewer');
      expect(screen.getByText('Protected Action')).toBeInTheDocument();
    });
  });

  describe('unauthenticated user', () => {
    it('should NOT show any gated content', () => {
      renderWithRole(null, 'viewer');
      expect(screen.queryByText('Protected Action')).not.toBeInTheDocument();
    });
  });
});
