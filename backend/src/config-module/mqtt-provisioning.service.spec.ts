import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MqttProvisioningService } from './mqtt-provisioning.service';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MqttProvisioningService', () => {
  let service: MqttProvisioningService;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory with mock mosquitto config files
    tempDir = mkdtempSync(join(tmpdir(), 'mqtt-test-'));
    writeFileSync(
      join(tempDir, 'password_file'),
      'backend_service:$7$101$hash\n',
    );
    writeFileSync(
      join(tempDir, 'acl_file'),
      [
        '# ACL for IoT Telemetry Platform',
        '',
        'user backend_service',
        'topic read $SYS/#',
        'topic read plant/motor/+/telemetry',
        '',
      ].join('\n'),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttProvisioningService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              if (key === 'MOSQUITTO_CONFIG_DIR') return tempDir;
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<MqttProvisioningService>(MqttProvisioningService);
  });

  describe('provisionMotor', () => {
    it('should generate a password and append to password_file', () => {
      const password = service.provisionMotor(16);

      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThan(10);

      const passwordFile = readFileSync(
        join(tempDir, 'password_file'),
        'utf-8',
      );
      expect(passwordFile).toContain('esp32_motor16:$7$101$');
    });

    it('should append ACL entries for the new motor', () => {
      service.provisionMotor(16);

      const aclFile = readFileSync(join(tempDir, 'acl_file'), 'utf-8');
      expect(aclFile).toContain('user esp32_motor16');
      expect(aclFile).toContain('topic write plant/motor/16/telemetry');
      expect(aclFile).toContain('topic write plant/motor/16/status');
      expect(aclFile).toContain('topic read plant/motor/16/cmd');
      expect(aclFile).toContain('topic read plant/motor/16/sensor/+/cmd');
      expect(aclFile).toContain('topic write plant/motor/16/cmd/ack');
      expect(aclFile).toContain('topic read qa/motor/16/inject-fault');
    });

    it('should not duplicate ACL if user already exists', () => {
      service.provisionMotor(16);
      service.provisionMotor(16); // Second call

      const aclFile = readFileSync(join(tempDir, 'acl_file'), 'utf-8');
      const occurrences = aclFile.split('user esp32_motor16').length - 1;
      expect(occurrences).toBe(1);
    });

    it('should replace password if user already exists in password_file', () => {
      service.provisionMotor(16);
      readFileSync(join(tempDir, 'password_file'), 'utf-8');

      service.provisionMotor(16);
      const secondPasswordFile = readFileSync(
        join(tempDir, 'password_file'),
        'utf-8',
      );

      // Should still have only one entry for motor16
      const entries = secondPasswordFile
        .split('\n')
        .filter((l) => l.startsWith('esp32_motor16:'));
      expect(entries).toHaveLength(1);
    });
  });

  describe('deprovisionMotor', () => {
    it('should remove user from password_file', () => {
      service.provisionMotor(16);
      service.deprovisionMotor(16);

      const passwordFile = readFileSync(
        join(tempDir, 'password_file'),
        'utf-8',
      );
      expect(passwordFile).not.toContain('esp32_motor16');
    });

    it('should remove ACL entries for the motor', () => {
      service.provisionMotor(16);
      service.deprovisionMotor(16);

      const aclFile = readFileSync(join(tempDir, 'acl_file'), 'utf-8');
      expect(aclFile).not.toContain('user esp32_motor16');
      expect(aclFile).not.toContain('plant/motor/16/');
    });

    it('should not affect other users when deprovisioning', () => {
      service.provisionMotor(16);
      service.provisionMotor(17);
      service.deprovisionMotor(16);

      const passwordFile = readFileSync(
        join(tempDir, 'password_file'),
        'utf-8',
      );
      expect(passwordFile).toContain('esp32_motor17');
      expect(passwordFile).toContain('backend_service');

      const aclFile = readFileSync(join(tempDir, 'acl_file'), 'utf-8');
      expect(aclFile).toContain('user esp32_motor17');
      expect(aclFile).toContain('user backend_service');
    });
  });
});
