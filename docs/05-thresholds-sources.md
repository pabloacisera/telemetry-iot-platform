# Threshold Sources — Full Traceability

Each row in `sensor_standards` includes its `source_reference`. This document explains the reasoning behind
each number, so it can be confidently defended in an interview.

## Vibration — ISO 10816-3 (Class I motors, <15kW, the typical size of our 15 simulated motors)
- Healthy (`healthy_max`): up to 1.80 mm/s RMS.
- Warning (`warning_max`): up to 4.5 mm/s RMS.
- Critical (`critical_max`): above 4.5 mm/s, damage zone — triggers immediate action without waiting for window.
- Sources: vibromera.eu/glossary/iso-10816-3, fabrico.io/blog/iso-10816-3-vibration-severity,
  researchgate.net (Class I zone table), industrialmonitordirect.com (C/D zone interpretation).
- Note: the complete standard (ISO 10816-3/20816-3) defines different A-D zones by motor size and foundation
  type; we specifically use Class I values because our motors are small/medium.

## Temperature — NEMA MG-1, Class B insulation (the most common in standard industrial motors)
- Reference: ambient 40°C + allowed rise (≈80°C for Class B) = winding temperature ≈120°C.
- SURFACE temperature (what an external sensor like thermocouple/DS18B20 actually measures) is
  typically 30°C lower than internal winding temperature.
- Translated to surface: healthy (`healthy_max`) ≤70°C, warning (`warning_max`) 70–90°C, critical (`critical_max`) >90°C.
- Source: engineeringtoolbox.com/nema-insulation-classes-d_734.html
- Important note: every 10°C of excess over the insulation class rating can reduce the motor's lifespan
  by half — this is what justifies "critical" triggering immediate action, not just an alert.

## Current — nameplate rating (rated_current_a per motor) ± margin
- Healthy (`healthy_max`): up to 1.05× rated current.
- Warning (`warning_max`): up to 1.3× rated (probable mechanical overload).
- Critical (`critical_max`): above 1.3× rated — triggers immediate action.
- This is the de facto standard in motor monitoring: mechanical overload translates directly to overcurrent.
- Note: `critical_max` for current is calculated per motor as `rated_current_a * 1.3` and stored in
  `motor_sensors` during the initial seed.

## Restart timings
- Sensor (microcontroller boot): 2–5s, we use 5s.
- Motor (anti-short-cycle timer): real documented range of 100s (minimum, small motors) to several minutes
  (large/high-voltage motors). The real floor of 100s is used, not compressed for the demo.
- Source: anti-short-cycle circuit patents for compressor/motor protection (100s as typical delay),
  ICM Controls catalog (5-minute fixed timers for larger equipment), industrialmonitordirect.com
  (10 minutes for high-voltage motors).

## Reconnection grace windows (WiFi/LAN)
- These do not correspond to a specific published standard — they are a reasoned engineering decision based
  on the known behavior of each link type (WiFi has normal transient reconnections, Ethernet almost always
  indicates a real physical failure if it drops). Documented as an engineering decision, not as a citation.
