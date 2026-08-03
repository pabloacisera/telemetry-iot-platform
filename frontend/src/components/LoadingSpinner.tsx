/**
 * Loading spinner — shown while pages or components are loading.
 * Pure CSS animation, no external dependencies.
 */
export function LoadingSpinner({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="spinner-container" role="status" aria-live="polite">
      <svg
        className="spinner-svg"
        viewBox="0 0 50 50"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          className="spinner-track"
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth="4"
        />
        <circle
          className="spinner-head"
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <p className="spinner-text">{message}</p>
    </div>
  );
}
