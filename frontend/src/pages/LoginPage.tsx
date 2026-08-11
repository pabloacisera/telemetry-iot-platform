import { useState } from 'react';
import type { FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { login } from '../store/auth.slice';

/**
 * Login page — email + password form with visibility toggle.
 * On success, stores access token in Redux and redirects to dashboard.
 */
export function LoginPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { loading, error } = useSelector((state: RootState) => state.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch(login({ email, password }));
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <i className="fa-solid fa-industry" aria-hidden="true" />
          <span>Telemetry IoT Platform</span>
        </div>
        <h1>Iniciar sesión</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Correo electrónico"
          />
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label="Contraseña"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <i
                className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}
                aria-hidden="true"
              />
            </button>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </div>
    </div>
  );
}
