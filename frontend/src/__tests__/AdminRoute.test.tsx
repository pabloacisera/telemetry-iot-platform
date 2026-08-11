import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminRoute } from '../components/routes/AdminRoute';
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
        refreshAttempted: true,
        error: null,
      },
    },
  });
  return store;
}

/** Render /config nested inside AdminRoute with a /dashboard fallback to observe redirects. */
function renderAdminRoute(role: string | null) {
  const store = createStoreWithRole(role);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/config']}>
        <Routes>
          <Route element={<AdminRoute />}>
            <Route path="/config" element={<div>Admin Page</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('AdminRoute', () => {
  it('should render content for an admin user', () => {
    renderAdminRoute('admin');
    expect(screen.getByText('Admin Page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('should redirect an operator user to the dashboard', () => {
    renderAdminRoute('operator');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
  });

  it('should redirect a viewer user to the dashboard', () => {
    renderAdminRoute('viewer');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
  });

  it('should redirect an unauthenticated user to the dashboard', () => {
    renderAdminRoute(null);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
