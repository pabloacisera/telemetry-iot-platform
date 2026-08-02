import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBadge } from '../components/motors/StatusBadge';

describe('StatusBadge', () => {
  it('should render the status text with underscores replaced by spaces', () => {
    render(<StatusBadge status="under_review" />);
    expect(screen.getByText('under review')).toBeInTheDocument();
  });

  it('should render healthy status', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('should render fault_persistent with spaces', () => {
    render(<StatusBadge status="fault_persistent" />);
    expect(screen.getByText('fault persistent')).toBeInTheDocument();
  });

  it('should have an aria-label for accessibility', () => {
    render(<StatusBadge status="restarting" />);
    expect(screen.getByLabelText('Status: restarting')).toBeInTheDocument();
  });

  it('should apply green color for healthy status', () => {
    const { container } = render(<StatusBadge status="healthy" />);
    const dot = container.querySelector('.badge-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#22c55e' });
  });

  it('should apply red color for fault status', () => {
    const { container } = render(<StatusBadge status="fault" />);
    const dot = container.querySelector('.badge-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#ef4444' });
  });

  it('should apply amber color for under_review status', () => {
    const { container } = render(<StatusBadge status="under_review" />);
    const dot = container.querySelector('.badge-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#f59e0b' });
  });

  it('should handle unknown status with fallback gray', () => {
    const { container } = render(<StatusBadge status="unknown_status" />);
    const dot = container.querySelector('.badge-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#9ca3af' });
  });
});
