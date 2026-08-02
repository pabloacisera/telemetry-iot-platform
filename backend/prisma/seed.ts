import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds the database with:
 * - 3 sensor_standards (vibration ISO 10816-3, temperature NEMA MG-1, current nameplate).
 * - 15 motors with realistic names, locations, and connection types.
 * - 45 motor_sensors (3 per motor) with thresholds derived from standards.
 */
async function main(): Promise<void> {
  // --- Sensor Standards ---
  await prisma.sensorStandard.upsert({
    where: { id: 1 },
    update: {},
    create: {
      sensorType: 'vibration',
      standardName: 'ISO 10816-3 Class I (<15kW)',
      unit: 'mm/s',
      plausibleMin: 0.0,
      plausibleMax: 20.0,
      defaultHealthyMax: 1.8,
      defaultWarningMax: 4.5,
      defaultCriticalMax: 4.5,
      sourceReference:
        'ISO 10816-3 zones A-D for Class I motors. Sources: vibromera.eu, fabrico.io/blog/iso-10816-3',
    },
  });

  await prisma.sensorStandard.upsert({
    where: { id: 2 },
    update: {},
    create: {
      sensorType: 'temperature',
      standardName: 'NEMA MG-1 Class B (surface)',
      unit: '°C',
      plausibleMin: 10.0,
      plausibleMax: 150.0,
      defaultHealthyMax: 70.0,
      defaultWarningMax: 90.0,
      defaultCriticalMax: 90.0,
      sourceReference:
        'NEMA MG-1 Class B. Surface ≈ winding-30°C. Source: engineeringtoolbox.com',
    },
  });

  await prisma.sensorStandard.upsert({
    where: { id: 3 },
    update: {},
    create: {
      sensorType: 'current',
      standardName: 'Nameplate rated ×1.05/×1.3',
      unit: 'A',
      plausibleMin: 0.0,
      plausibleMax: 100.0,
      defaultHealthyMax: 1.05,
      defaultWarningMax: 1.3,
      defaultCriticalMax: 1.3,
      sourceReference:
        'De facto standard: overcurrent = mechanical overload. >1.3x = immediate action.',
    },
  });

  // --- 15 Motors ---
  const motorConfigs = [
    { code: 'MTR-01', name: 'Compressor A1', location: 'Hall A - North', rated: 8.5, conn: 'wifi' },
    { code: 'MTR-02', name: 'Compressor A2', location: 'Hall A - North', rated: 10.0, conn: 'wifi' },
    { code: 'MTR-03', name: 'Pump B1', location: 'Hall B - East', rated: 12.0, conn: 'wifi' },
    { code: 'MTR-04', name: 'Pump B2', location: 'Hall B - East', rated: 9.2, conn: 'wifi' },
    { code: 'MTR-05', name: 'Fan C1', location: 'Hall C - South', rated: 15.0, conn: 'wifi' },
    { code: 'MTR-06', name: 'Fan C2', location: 'Hall C - South', rated: 11.5, conn: 'wifi' },
    { code: 'MTR-07', name: 'Conveyor D1', location: 'Hall D - West', rated: 7.8, conn: 'wifi' },
    { code: 'MTR-08', name: 'Conveyor D2', location: 'Hall D - West', rated: 13.0, conn: 'wifi' },
    { code: 'MTR-09', name: 'Mixer E1', location: 'Hall E - Center', rated: 14.5, conn: 'lan' },
    { code: 'MTR-10', name: 'Mixer E2', location: 'Hall E - Center', rated: 10.8, conn: 'lan' },
    { code: 'MTR-11', name: 'Grinder F1', location: 'Hall F - Basement', rated: 16.0, conn: 'lan' },
    { code: 'MTR-12', name: 'Grinder F2', location: 'Hall F - Basement', rated: 9.0, conn: 'lan' },
    { code: 'MTR-13', name: 'Press G1', location: 'Hall G - Upper', rated: 12.5, conn: 'lan' },
    { code: 'MTR-14', name: 'Press G2', location: 'Hall G - Upper', rated: 11.0, conn: 'lan' },
    { code: 'MTR-15', name: 'Lathe H1', location: 'Hall H - Workshop', rated: 8.0, conn: 'lan' },
  ];

  for (const m of motorConfigs) {
    const motor = await prisma.motor.upsert({
      where: { code: m.code },
      update: {},
      create: {
        code: m.code,
        name: m.name,
        location: m.location,
        ratedCurrentA: m.rated,
        connectionType: m.conn,
      },
    });

    const sensorDefs = [
      { type: 'temperature', healthy: 70.0, warning: 90.0, critical: 90.0 },
      { type: 'vibration', healthy: 1.8, warning: 4.5, critical: 4.5 },
      { type: 'current', healthy: m.rated * 1.05, warning: m.rated * 1.3, critical: m.rated * 1.3 },
    ];

    for (const s of sensorDefs) {
      await prisma.motorSensor.upsert({
        where: { motorId_sensorType: { motorId: motor.id, sensorType: s.type } },
        update: {},
        create: {
          motorId: motor.id,
          sensorType: s.type,
          healthyMax: s.healthy,
          warningMax: s.warning,
          criticalMax: s.critical,
        },
      });
    }
  }

  console.log('Seed complete: 3 standards + 15 motors + 45 sensors');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
