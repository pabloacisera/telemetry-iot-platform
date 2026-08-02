import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  function createMockContext(userRole: string | null): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: userRole ? { role: userRole } : null,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access when no @Roles decorator is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext('viewer');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user role matches required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'operator']);
    const context = createMockContext('admin');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow operator when both admin and operator are allowed', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'operator']);
    const context = createMockContext('operator');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when viewer tries to access admin/operator endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'operator']);
    const context = createMockContext('viewer');

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when operator tries to access admin-only endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const context = createMockContext('operator');

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no role in token', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const context = createMockContext(null);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should include required roles in error message', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const context = createMockContext('viewer');

    try {
      guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect((e as ForbiddenException).message).toContain('admin');
    }
  });
});
