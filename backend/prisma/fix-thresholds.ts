/**
 * One-time migration: fix sensor thresholds for existing motors.
 * 
 * Problem: warningMax == criticalMax in the original seed, preventing
 * the evaluation engine from ever detecting "warning" level anomalies.
 * 
 * Run: npx ts-node prisma/fix-thresholds.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Fix temperature sensors: 70 / 80 / 90
  const tempResult = await prisma.motorSensor.updateMany({
    where: { sensorType: 'temperature' },
    data: { healthyMax: 70.0, warningMax: 80.0, criticalMax: 90.0 },
  });
  console.log(`Temperature sensors updated: ${tempResult.count}`);

  // Fix vibration sensors: 1.8 / 2.8 / 4.5
  const vibResult = await prisma.motorSensor.updateMany({
    where: { sensorType: 'vibration' },
    data: { healthyMax: 1.8, warningMax: 2.8, criticalMax: 4.5 },
  });
  console.log(`Vibration sensors updated: ${vibResult.count}`);

  // Fix current sensors: rated×1.05 / rated×1.15 / rated×1.3
  // Current depends on each motor's ratedCurrentA, so we need per-motor updates
  const motors = await prisma.motor.findMany({ select: { id: true, ratedCurrentA: true } });
  let currentCount = 0;
  for (const motor of motors) {
    const result = await prisma.motorSensor.updateMany({
      where: { motorId: motor.id, sensorType: 'current' },
      data: {
        healthyMax: Math.round(motor.ratedCurrentA * 1.05 * 100) / 100,
        warningMax: Math.round(motor.ratedCurrentA * 1.15 * 100) / 100,
        criticalMax: Math.round(motor.ratedCurrentA * 1.3 * 100) / 100,
      },
    });
    currentCount += result.count;
  }
  console.log(`Current sensors updated: ${currentCount}`);

  // Also update sensor_standards table
  await prisma.sensorStandard.update({
    where: { id: 1 },
    data: { defaultWarningMax: 2.8, defaultCriticalMax: 4.5 },
  });
  await prisma.sensorStandard.update({
    where: { id: 2 },
    data: { defaultWarningMax: 80.0, defaultCriticalMax: 90.0 },
  });
  await prisma.sensorStandard.update({
    where: { id: 3 },
    data: { defaultWarningMax: 1.15, defaultCriticalMax: 1.3 },
  });
  console.log('Sensor standards updated');

  console.log('\nDone! Restart the backend to reload sensor metadata from DB.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
