import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, pbkdf2Sync } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Service for provisioning MQTT credentials and ACL entries in Mosquitto.
 *
 * When a motor is created, this service:
 * 1. Generates a secure password for the ESP32 device
 * 2. Hashes it in Mosquitto-compatible PBKDF2-SHA512 format
 * 3. Appends the user to the password_file
 * 4. Appends ACL entries for the motor's topics
 *
 * The broker watches these files from inside its own container and reloads
 * them with SIGHUP automatically (see mosquitto/entrypoint.sh), so this
 * service does not need access to the Docker daemon.
 *
 * When a motor is deleted, it removes the corresponding entries.
 */
@Injectable()
export class MqttProvisioningService {
  private readonly logger = new Logger(MqttProvisioningService.name);
  private readonly mosquittoDir: string;

  constructor(private readonly configService: ConfigService) {
    this.mosquittoDir = this.configService.get<string>(
      'MOSQUITTO_CONFIG_DIR',
      join(process.cwd(), '..', 'mosquitto'),
    );
  }

  /**
   * Provision a new MQTT user for a motor.
   * @returns The generated plaintext password (to show once to the admin).
   */
  provisionMotor(motorId: number): string {
    const username = `esp32_motor${motorId}`;
    const password = this.generatePassword();
    const hash = this.generateMosquittoHash(password);

    // Append to password_file
    this.appendToPasswordFile(username, hash);

    // Append ACL entries
    this.appendAclEntries(username, motorId);

    this.logger.log(`Provisioned MQTT credentials for ${username}`);
    return password;
  }

  /**
   * Remove MQTT user and ACL entries for a motor.
   */
  deprovisionMotor(motorId: number): void {
    const username = `esp32_motor${motorId}`;

    this.removeFromPasswordFile(username);
    this.removeAclEntries(username);

    this.logger.log(`Deprovisioned MQTT credentials for ${username}`);
  }

  /**
   * Generate a cryptographically secure random password.
   */
  private generatePassword(): string {
    return randomBytes(24).toString('base64url');
  }

  /**
   * Generate Mosquitto-compatible PBKDF2-SHA512 hash.
   * Format: $7$<iterations>$<base64_salt>$<base64_hash>
   */
  private generateMosquittoHash(password: string): string {
    const iterations = 101;
    const salt = randomBytes(12);
    const dk = pbkdf2Sync(password, salt, iterations, 64, 'sha512');
    const saltB64 = salt.toString('base64');
    const dkB64 = dk.toString('base64');
    return `$7$${iterations}$${saltB64}$${dkB64}`;
  }

  /**
   * Append a user:hash line to the password file.
   */
  private appendToPasswordFile(username: string, hash: string): void {
    const filePath = join(this.mosquittoDir, 'password_file');
    const content = readFileSync(filePath, 'utf-8');

    // Check if user already exists
    if (content.includes(`${username}:`)) {
      // Replace existing entry
      const updated = content
        .split('\n')
        .map((line) =>
          line.startsWith(`${username}:`) ? `${username}:${hash}` : line,
        )
        .join('\n');
      writeFileSync(filePath, updated, 'utf-8');
    } else {
      // Append new entry
      const newLine = content.endsWith('\n') ? '' : '\n';
      writeFileSync(
        filePath,
        content + newLine + `${username}:${hash}\n`,
        'utf-8',
      );
    }
  }

  /**
   * Remove a user from the password file.
   */
  private removeFromPasswordFile(username: string): void {
    const filePath = join(this.mosquittoDir, 'password_file');
    const content = readFileSync(filePath, 'utf-8');
    const updated = content
      .split('\n')
      .filter((line) => !line.startsWith(`${username}:`))
      .join('\n');
    writeFileSync(filePath, updated, 'utf-8');
  }

  /**
   * Append standard ACL entries for a motor's ESP32 device.
   */
  private appendAclEntries(username: string, motorId: number): void {
    const filePath = join(this.mosquittoDir, 'acl_file');
    const content = readFileSync(filePath, 'utf-8');

    // Check if ACL already exists for this user
    if (content.includes(`user ${username}`)) {
      this.logger.warn(`ACL entries for ${username} already exist, skipping`);
      return;
    }

    const aclBlock = [
      '',
      `user ${username}`,
      `topic write plant/motor/${motorId}/telemetry`,
      `topic write plant/motor/${motorId}/status`,
      `topic write plant/motor/${motorId}/restart-progress`,
      `topic read plant/motor/${motorId}/cmd`,
      `topic read plant/motor/${motorId}/sensor/+/cmd`,
      `topic write plant/motor/${motorId}/cmd/ack`,
      `topic write plant/motor/${motorId}/sensor/+/cmd/ack`,
      `topic read qa/motor/${motorId}/inject-fault`,
      '',
    ].join('\n');

    writeFileSync(filePath, content + aclBlock, 'utf-8');
  }

  /**
   * Remove ACL entries for a given username.
   */
  private removeAclEntries(username: string): void {
    const filePath = join(this.mosquittoDir, 'acl_file');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const filtered: string[] = [];
    let skipping = false;

    for (const line of lines) {
      if (line.trim() === `user ${username}`) {
        skipping = true;
        continue;
      }
      // Stop skipping when we hit the next user block or a comment/blank line after topics
      if (skipping) {
        if (
          line.startsWith('user ') ||
          (line.trim() === '' &&
            !filtered[filtered.length - 1]?.startsWith('topic'))
        ) {
          skipping = false;
          // Keep this line (it's the next user or separator)
          if (line.trim() !== '') filtered.push(line);
        }
        // Skip topic lines belonging to the removed user
        continue;
      }
      filtered.push(line);
    }

    writeFileSync(filePath, filtered.join('\n'), 'utf-8');
  }
}
