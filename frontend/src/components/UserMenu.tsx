import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { AppDispatch, RootState } from '../store';
import { logoutUser } from '../store/auth.slice';

const ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  operator: 'Operador',
  admin: 'Administrador',
};

/**
 * Session chip — shows the signed-in user (email + role) with a logout button.
 * Renders nothing when there is no authenticated user.
 */
export function UserMenu() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    setBusy(true);
    try {
      await dispatch(logoutUser()).unwrap();
    } catch {
      // Local state is already cleared (thunk finally); just leave the app.
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="user-menu">
      <div className="user-chip" title={user.email}>
        <i className="fa-solid fa-circle-user" aria-hidden="true" />
        <div className="user-chip-text">
          <span className="user-chip-email">{user.email}</span>
          <span className="user-chip-role">{ROLE_LABELS[user.role] ?? user.role}</span>
        </div>
      </div>
      <button
        type="button"
        className="logout-button"
        onClick={handleLogout}
        disabled={busy}
        title="Cerrar sesión"
      >
        <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
      </button>
    </div>
  );
}
