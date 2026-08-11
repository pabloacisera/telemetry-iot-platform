import { useState, type FormEvent } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../store';
import { api } from '../services/api';

const GRAFANA_LINK = import.meta.env.VITE_GRAFANA_URL as string | undefined;

type SubscribeStatus = 'idle' | 'loading' | 'success' | 'error';

const BENEFITS = [
  {
    icon: 'fa-solid fa-chart-line',
    title: 'Monitoreo en tiempo real',
    description:
      'Vibración, temperatura y corriente de cada motor, actualizadas cada pocos segundos vía MQTT y visibles desde el panel.',
  },
  {
    icon: 'fa-solid fa-triangle-exclamation',
    title: 'Detección temprana de fallas',
    description:
      'Lecturas anómalas se detectan antes de que deriven en una rotura, comparando cada sensor contra umbrales configurables.',
  },
  {
    icon: 'fa-solid fa-bell',
    title: 'Alarmas y paradas automáticas',
    description:
      'Alertas instantáneas y trip de seguridad ante una lectura crítica, con ventana de gracia y reinicio controlado.',
  },
  {
    icon: 'fa-solid fa-rotate-right',
    title: 'Reinicio inteligente',
    description:
      'Reinicio automático configurable tras una falla, con cooldown y cantidad máxima de intentos para proteger el motor.',
  },
  {
    icon: 'fa-solid fa-clock-rotate-left',
    title: 'Historial completo',
    description:
      'Historial de alarmas, estados y lecturas por motor para auditar, analizar y mejorar la operación de la planta.',
  },
  {
    icon: 'fa-solid fa-user-shield',
    title: 'Control por roles',
    description:
      'Acceso por roles (viewer, operador, administrador) con comandos de control protegidos según el nivel de cada usuario.',
  },
];

const STEPS = [
  {
    icon: 'fa-solid fa-plug-circle-bolt',
    title: 'Conectá los sensores',
    description:
      'Los sensores de vibración, temperatura y corriente publican sus lecturas por MQTT al gateway de la plataforma, sin infraestructura adicional.',
  },
  {
    icon: 'fa-solid fa-gauge-high',
    title: 'Monitoreá en tiempo real',
    description:
      'El panel muestra todos los motores con su estado y valores de sensores. Cada anomalía se marca al instante con su nivel de severidad.',
  },
  {
    icon: 'fa-solid fa-wand-magic-sparkles',
    title: 'Automatizá la respuesta',
    description:
      'La plataforma decide: alarma, parada de emergencia o reinicio automático según reglas configurables por motor y por sensor.',
  },
];

const SHOTS = [
  {
    icon: 'fa-solid fa-border-all',
    title: 'Panel general de planta',
    description: 'Todos los motores con estado y sensores en una vista.',
  },
  {
    icon: 'fa-solid fa-wave-square',
    title: 'Detalle de motor',
    description: 'Gráficos de vibración, temperatura y corriente por motor.',
  },
  {
    icon: 'fa-solid fa-table-list',
    title: 'Historial de alertas',
    description: 'Trazabilidad completa de alarmas, causas y acciones.',
  },
];

/** Public landing page — sells the product and captures subscription emails. */
export function LandingPage() {
  const user = useSelector((state: RootState) => state.auth.user);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SubscribeStatus>('idle');
  const [error, setError] = useState('');

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;

    setStatus('loading');
    setError('');
    try {
      await api.post('/landing/subscribe', { email });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      const status =
        typeof err === 'object' && err !== null
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      setError(
        status === 409
          ? 'Ya tenés acceso con este correo. Revisá tu bandeja de entrada (y la carpeta de spam/no deseado).'
          : 'No pudimos registrar tu solicitud. Probá de nuevo o escribinos por otro medio.',
      );
    }
  };

  const primaryLink = user ? { to: '/dashboard', label: 'Ir al panel' } : { to: '/login', label: 'Ingresar' };

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a href="#top" className="landing-brand">
            <i className="fa-solid fa-industry" aria-hidden="true" />
            Telemetry IoT Platform
          </a>
          <nav className="landing-nav-links" aria-label="Principal">
            <a href="#beneficios">Beneficios</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#capturas">Plataforma</a>
            <a href="#contacto">Contacto</a>
            <Link to={primaryLink.to} className="landing-cta-btn">
              {primaryLink.label}
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow">Monitoreo industrial en tiempo real</span>
              <h1>
                Prevení fallas en tus motores <span className="landing-accent-text">antes de que paren la planta</span>
              </h1>
              <p className="landing-hero-sub">
                Sensores de vibración, temperatura y corriente, un panel en tiempo real
                y reglas automáticas de alarma y protección. Menos paradas no planificadas,
                más control sobre tu operación.
              </p>
              <div className="landing-hero-actions">
                <a href="#contacto" className="landing-cta-btn landing-cta-btn--primary">
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Solicitar acceso
                </a>
                <a href="#como-funciona" className="landing-cta-btn landing-cta-btn--ghost">
                  Ver cómo funciona
                </a>
              </div>
            </div>
            <div className="landing-shot landing-shot--hero" role="img" aria-label="Captura del panel de monitoreo">
              <i className="fa-solid fa-image" aria-hidden="true" />
              <span>Captura del panel — próximamente</span>
            </div>
          </div>
        </section>

        <section className="landing-stats" aria-label="Cifras de la plataforma">
          <div className="landing-stats-inner">
            <div className="landing-stat">
              <strong>15</strong>
              <span>motores por planta</span>
            </div>
            <div className="landing-stat">
              <strong>3</strong>
              <span>sensores por motor</span>
            </div>
            <div className="landing-stat">
              <strong>Segundos</strong>
              <span>de latencia en alertas</span>
            </div>
            <div className="landing-stat">
              <strong>24/7</strong>
              <span>monitoreo continuo</span>
            </div>
          </div>
        </section>

        <section id="beneficios" className="landing-section">
          <div className="landing-section-head">
            <h2>Beneficios para tu planta</h2>
            <p>Una plataforma pensada para empresas del sector y para los operarios que la usan todos los días.</p>
          </div>
          <div className="landing-cards">
            {BENEFITS.map((benefit) => (
              <article key={benefit.title} className="landing-card">
                <i className={`${benefit.icon} landing-card-icon`} aria-hidden="true" />
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="landing-section landing-section--alt">
          <div className="landing-section-head">
            <h2>Cómo funciona</h2>
            <p>De los sensores a la acción automática en tres pasos.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map((step, index) => (
              <article key={step.title} className="landing-step">
                <span className="landing-step-num">{index + 1}</span>
                <i className={`${step.icon} landing-card-icon`} aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="capturas" className="landing-section">
          <div className="landing-section-head">
            <h2>Así se ve la plataforma</h2>
            <p>Un vistazo a las pantallas principales que usarán tu equipo.</p>
          </div>
          <div className="landing-shots">
            {SHOTS.map((shot) => (
              <figure key={shot.title} className="landing-shot landing-shot--card">
                <i className="fa-solid fa-image" aria-hidden="true" />
                <span className="landing-shot-label">Captura próximamente</span>
                <figcaption>
                  <h3>{shot.title}</h3>
                  <p>{shot.description}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          {GRAFANA_LINK && (
            <p className="landing-grafana-note">
              También accedé a paneles de analítica avanzada con{' '}
              <a href={GRAFANA_LINK} target="_blank" rel="noopener noreferrer">Grafana</a>.
            </p>
          )}
        </section>

        <section id="contacto" className="landing-section landing-section--subscribe">
          <div className="landing-subscribe">
            <h2>¿Listo para proteger tu planta?</h2>
            <p>
              Dejanos tu correo y te enviamos el acceso a una demo con todas las
              funcionalidades habilitadas.
            </p>
            {status === 'success' ? (
              <div className="landing-subscribe-success" role="status">
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
                <strong>¡Listo!</strong>
                <span>
                  Te enviamos tus credenciales de acceso a{' '}
                  <strong>{email}</strong>. Revisá tu bandeja de entrada y también
                  la carpeta de spam/no deseado.
                </span>
              </div>
            ) : (
              <form className="landing-subscribe-form" onSubmit={handleSubscribe}>
                <label htmlFor="landing-email" className="visually-hidden">
                  Correo electrónico
                </label>
                <input
                  id="landing-email"
                  type="email"
                  required
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'loading'}
                />
                <button type="submit" disabled={status === 'loading'}>
                  {status === 'loading' ? 'Enviando…' : 'Solicitar acceso'}
                </button>
              </form>
            )}
            {status === 'error' && (
              <p className="landing-subscribe-error" role="alert">{error}</p>
            )}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-brand">
            <i className="fa-solid fa-industry" aria-hidden="true" />
            Telemetry IoT Platform
          </div>
          <p>
            Monitoreo predictivo de motores industriales para reducir paradas y
            proteger tu operación.
          </p>
          <div className="landing-footer-links">
            <a href="#top">Inicio</a>
            <a href="#beneficios">Beneficios</a>
            <a href="#como-funciona">Cómo funciona</a>
            <Link to="/login">Ingresar</Link>
          </div>
        </div>
        <p className="landing-footer-copy">
          © {new Date().getFullYear()} Telemetry IoT Platform. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
