import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

/**
 * Auth controller — login, refresh, logout.
 *
 * - Login returns access token in body, sets refresh token as httpOnly cookie.
 * - Refresh reads the cookie, rotates the token, returns new access token.
 * - Logout revokes the refresh token.
 *
 * Rate limited: 5 requests/minute per IP (handled by ThrottlerGuard at module level).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Login with email + password. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(
      dto.email,
      dto.password,
    );

    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  /** Refresh access token using the httpOnly cookie. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldToken = (
      req as unknown as { cookies?: { refresh_token?: string } }
    ).cookies?.refresh_token;
    if (!oldToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const { accessToken, refreshToken } =
      await this.authService.refresh(oldToken);

    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  /** Logout — revoke the refresh token. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req as unknown as { cookies?: { refresh_token?: string } })
      .cookies?.refresh_token;
    if (token) {
      await this.authService.logout(token);
    }

    res.clearCookie('refresh_token');
    return { message: 'Logged out' };
  }

  /** Set the refresh token as a secure httpOnly cookie. */
  private setRefreshCookie(res: Response, token: string): void {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth',
    });
  }
}
