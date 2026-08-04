import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket gateway for real-time event emission to connected frontends.
 *
 * Lifecycle:
 * - On connect: client is auto-joined to 'dashboard' room (receives all telemetry).
 * - Client can emit 'join-motor' to join a specific motor room (for detail page).
 * - Client can emit 'leave-motor' to leave.
 *
 * Emitted events: telemetry, status-change, alert, restart-progress.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /** On connect: join client to 'dashboard' room + listen for room commands. */
  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
    void client.join('dashboard');

    client.on('join-motor', (motorId: number) => {
      void client.join(`motor:${motorId}`);
    });

    client.on('leave-motor', (motorId: number) => {
      void client.leave(`motor:${motorId}`);
    });
  }

  /** Log WebSocket client disconnections. */
  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Emit a telemetry reading to dashboard (all) AND motor room. */
  emitTelemetry(motorId: number, data: Record<string, unknown>): void {
    this.server.to('dashboard').emit('telemetry', data);
    this.server.to(`motor:${motorId}`).emit('telemetry', data);
  }

  /** Emit a motor or sensor status change to dashboard AND motor room. */
  emitStatusChange(motorId: number, data: Record<string, unknown>): void {
    this.server.to('dashboard').emit('status-change', data);
    this.server.to(`motor:${motorId}`).emit('status-change', data);
  }

  /** Emit an alert globally (for alert banner) AND to motor room. */
  emitAlert(motorId: number, data: Record<string, unknown>): void {
    this.server.to('dashboard').emit('alert', data);
    this.server.to(`motor:${motorId}`).emit('alert', data);
  }

  /** Emit restart countdown progress to dashboard AND motor room. */
  emitRestartProgress(motorId: number, data: Record<string, unknown>): void {
    this.server.to('dashboard').emit('restart-progress', data);
    this.server.to(`motor:${motorId}`).emit('restart-progress', data);
  }
}
