import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from './store';
import { refreshToken } from './store/auth.slice';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MotorDetailPage } from './pages/MotorDetailPage';
import { ReferencePage } from './pages/ReferencePage';
import { ConfigPage } from './pages/ConfigPage';
import { AlertHistoryPage } from './pages/AlertHistoryPage';
import { LandingPage } from './pages/LandingPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProtectedRoute } from './components/routes/ProtectedRoute';
import { AdminRoute } from './components/routes/AdminRoute';

/**
 * Root application component.
 * Attempts a single refresh on mount. ProtectedRoute handles the gate.
 */
function App() {
  const dispatch = useDispatch<AppDispatch>();
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const attempted = useRef(false);

  useEffect(() => {
    if (!accessToken && !attempted.current) {
      attempted.current = true;
      dispatch(refreshToken());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const user = useSelector((state: RootState) => state.auth.user);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" /> : <LoginPage />}
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/motors/:id" element={<MotorDetailPage />} />
          <Route path="/referencia" element={<ReferencePage />} />
          <Route path="/alertas" element={<AlertHistoryPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/config" element={<ConfigPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
