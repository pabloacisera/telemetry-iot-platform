import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBadge } from '../components/motors/StatusBadge';

describe('StatusBadge', () => {
  it('should render Spanish label for under_review', () => {
    render(<StatusBadge status="under_review" />);
    expect(screen.getByText('En revisión')).toBeInTheDocument();
  });

  it('should render Spanish label for healthy', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText('Saludable')).toBeInTheDocument();
  });

  it('should render Spanish label for fault_persistent', () => {
    render(<StatusBadge status="fault_persistent" />);
    expect(screen.getByText('Falla persistente')).toBeInTheDocument();
  });

  it('should have an aria-label for accessibility', () => {
    render(<StatusBadge status="restarting" />);
    expect(screen.getByLabelText('Estado: Reiniciando')).toBeInTheDocument();
  });

  it('should render a FontAwesome icon element with correct class for healthy', () => {
    const { container } = render(<StatusBadge status="healthy" />);
    const icon = container.querySelector('.badge-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('fa-solid', 'fa-circle-check');
  });

  it('should render FA icon for fault status', () => {
    const { container } = render(<StatusBadge status="fault" />);
    const icon = container.querySelector('.badge-icon');
    expect(icon).toHaveClass('fa-solid', 'fa-bolt');
  });

  it('should render FA icon for under_review', () => {
    const { container } = render(<StatusBadge status="under_review" />);
    const icon = container.querySelector('.badge-icon');
    expect(icon).toHaveClass('fa-solid', 'fa-triangle-exclamation');
  });

  it('should apply correct color style for healthy (green)', () => {
    const { container } = render(<StatusBadge status="healthy" />);
    const icon = container.querySelector('.badge-icon');
    expect(icon).toHaveStyle({ color: '#22c55e' });
  });

  it('should apply correct color style for fault (red)', () => {
    const { container } = render(<StatusBadge status="fault" />);
    const icon = container.querySelector('.badge-icon');
    expect(icon).toHaveStyle({ color: '#ef4444' });
  });

  it('should handle unknown status with fallback', () => {
    render(<StatusBadge status="unknown_xyz" />);
    // Should render the status as-is with underscores replaced
    expect(screen.getByText('unknown xyz')).toBeInTheDocument();
  });
});
