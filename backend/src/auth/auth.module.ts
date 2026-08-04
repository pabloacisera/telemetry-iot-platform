import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change_me_in_production'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    ThrottlerModule.forRoot([
      { name: 'auth', ttl: 60000, limit: 5 }, // 5 req/min for auth routes
      { name: 'general', ttl: 60000, limit: 60 }, // 60 req/min for everything else
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [AuthService, RolesGuard, JwtModule],
})
export class AuthModule {}
