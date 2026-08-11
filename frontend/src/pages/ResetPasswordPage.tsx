import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

/**
 * Reset password page — receives the single-use token via ?token= in the URL,
 * asks for a new password and posts it to the backend.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/password/reset', { token, newPassword: password });
      setDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'El enlace no es válido o ya fue utilizado',
      );
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-brand">
            <i className="fa-solid fa-industry" aria-hidden="true" />
            <span>Telemetry IoT Platform</span>
          </div>
          <h1>Enlace inválido</h1>
          <div className="reset-error" role="alert">
            <p>
              Este enlace de restablecimiento es inválido o está incompleto.
              Pedí uno nuevo desde la página de inicio de sesión.
            </p>
          </div>
          <p className="auth-link">
            <Link to="/forgot-password">Solicitar un nuevo enlace</Link>
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-brand">
            <i className="fa-solid fa-industry" aria-hidden="true" />
            <span>Telemetry IoT Platform</span>
          </div>
          <h1>¡Listo!</h1>
          <div className="reset-success" role="status">
            <p>Tu contraseña se actualizó correctamente.</p>
            <p className="reset-success-note">
              Las sesiones activas se cerraron por seguridad.
            </p>
          </div>
          <p className="auth-link">
            <Link to="/login">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <i className="fa-solid fa-industry" aria-hidden="true" />
          <span>Telemetry IoT Platform</span>
        </div>
        <h1>Nueva contraseña</h1>
        <p className="login-hint">
          Elegí una contraseña nueva (mínimo 8 caracteres).
        </p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              aria-label="Nueva contraseña"
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
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              aria-label="Confirmar contraseña"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
              title={showPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
            >
              <i
                className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}
                aria-hidden="true"
              />
            </button>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </div>
    </div>
  );
}
