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
 * Clients join rooms by motor_id to receive targeted updates.
 * Emitted events: telemetry, status-change, alert, restart-progress.
 * This is a push-only gateway — the frontend subscribes, never sends commands here.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /** Log new WebSocket client connections. */
  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  /** Log WebSocket client disconnections. */
  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Emit a telemetry reading to the motor's room. */
  emitTelemetry(motorId: number, data: Record<string, unknown>): void {
    this.server.to(`motor:${motorId}`).emit('telemetry', data);
  }

  /** Emit a motor or sensor status change to the motor's room. */
  emitStatusChange(motorId: number, data: Record<string, unknown>): void {
    this.server.to(`motor:${motorId}`).emit('status-change', data);
  }

  /** Emit an alert to the motor's room AND broadcast globally (for alert banner). */
  emitAlert(motorId: number, data: Record<string, unknown>): void {
    this.server.to(`motor:${motorId}`).emit('alert', data);
    this.server.emit('alert', data);
  }

  /** Emit restart countdown progress to the motor's room. */
  emitRestartProgress(motorId: number, data: Record<string, unknown>): void {
    this.server.to(`motor:${motorId}`).emit('restart-progress', data);
  }
}
