import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from './store';
import { refreshToken } from './store/auth.slice';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MotorDetailPage } from './pages/MotorDetailPage';
import { ReferencePage } from './pages/ReferencePage';
import { ProtectedRoute } from './components/routes/ProtectedRoute';

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
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" /> : <LoginPage />}
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/motors/:id" element={<MotorDetailPage />} />
          <Route path="/referencia" element={<ReferencePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
