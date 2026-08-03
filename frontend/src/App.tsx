import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from './store';
import { refreshToken } from './store/auth.slice';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MotorDetailPage } from './pages/MotorDetailPage';
import { ProtectedRoute } from './components/routes/ProtectedRoute';

/**
 * Root application component.
 * On mount, attempts to restore session via refresh token (httpOnly cookie).
 * Routes: /login (public), /dashboard and /motors/:id (protected).
 */
function App() {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth.user);
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);

  // On first load, try to restore session from refresh cookie
  useEffect(() => {
    if (!accessToken) {
      dispatch(refreshToken());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" /> : <LoginPage />}
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/motors/:id" element={<MotorDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
