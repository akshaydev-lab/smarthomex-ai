-- ==============================================================================
-- SmartHomeX AI - Gas Sensor Status Constraint Enhancement
-- Allows 'warming_up' and 'sensor_fault' in sensor_readings.gas_status
-- Ensures hardware states (heater stabilization & open-circuit fault) are preserved
-- ==============================================================================

ALTER TABLE public.sensor_readings 
  DROP CONSTRAINT IF EXISTS sensor_readings_gas_status_check;

ALTER TABLE public.sensor_readings 
  ADD CONSTRAINT sensor_readings_gas_status_check 
  CHECK (gas_status IN ('safe', 'warning', 'danger', 'warming_up', 'sensor_fault'));

