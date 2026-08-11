import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

/**
 * Forgot password page — asks for the email and requests a reset link.
 * The backend always returns the same message to avoid account enumeration,
 * so this page shows the generic confirmation regardless of the outcome.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/password/forgot', { email });
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <i className="fa-solid fa-industry" aria-hidden="true" />
          <span>Telemetry IoT Platform</span>
        </div>

        {submitted ? (
          <>
            <h1>Solicitud enviada</h1>
            <div className="reset-success" role="status">
              <p>
                Si existe una cuenta con <strong>{email}</strong>, te enviamos un
                enlace para restablecer tu contraseña. Revisá tu bandeja de entrada.
              </p>
              <p className="reset-success-note">
                El enlace es de uso único y vence en 30 minutos. Si no lo ves,
                revisá la carpeta de spam o no deseado.
              </p>
            </div>
            <p className="auth-link">
              <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Restablecer contraseña</h1>
            <p className="login-hint">
              Ingresá tu correo electrónico y te enviamos un enlace para
              restablecer tu contraseña.
            </p>
            <form onSubmit={handleSubmit} className="login-form">
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Correo electrónico"
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
              {error && <p className="error" role="alert">{error}</p>}
            </form>
            <p className="auth-link">
              <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
