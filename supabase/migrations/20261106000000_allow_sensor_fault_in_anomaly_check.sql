-- ==============================================================================
-- SmartHomeX AI - Sensor Readings Anomaly Constraint Enhancement
-- Allows 'sensor_fault' in sensor_readings.anomaly
-- Preserves hardware fault telemetry when INA219 energy monitor is disconnected
-- or reports open-circuit / invalid conditions.
-- ==============================================================================

ALTER TABLE public.sensor_readings 
  DROP CONSTRAINT IF EXISTS sensor_readings_anomaly_check;

ALTER TABLE public.sensor_readings 
  ADD CONSTRAINT sensor_readings_anomaly_check 
  CHECK (anomaly IN ('normal', 'overcurrent', 'overpower', 'voltage_sag', 'voltage_surge', 'sensor_fault'));

COMMENT ON CONSTRAINT sensor_readings_anomaly_check ON public.sensor_readings 
  IS 'Validates anomaly classification allowlist including hardware sensor_fault';

