import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma';
import { CacheModule } from './cache';
import { RealtimeModule } from './realtime';
import { TelemetryModule } from './telemetry';
import { CommandModule } from './command/command.module';
import { MotorsModule } from './motors';
import { AlertsModule } from './alerts';
import { AuthModule } from './auth';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CacheModule,
    RealtimeModule,
    CommandModule,
    TelemetryModule,
    MotorsModule,
    AlertsModule,
    AuthModule,
  ],
})
export class AppModule {}
