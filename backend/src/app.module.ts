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
import { RagModule } from './rag';
import { MotorConfigModule } from './config-module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CacheModule,
    RealtimeModule,
    CommandModule,
    TelemetryModule,
    MotorsModule,
    AlertsModule,
    AuthModule,
    RagModule,
    MotorConfigModule,
  ],
})
export class AppModule {}
