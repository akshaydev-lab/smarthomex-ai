-- ==============================================================================
-- SmartHomeX AI - Phase 3A: Add gas_raw_adc to sensor_readings
-- Migration: 20261103010000_add_gas_raw_adc_to_sensor_readings.sql
-- ==============================================================================

-- Add nullable integer column gas_raw_adc for ground-truth 12-bit ADC reading (0 - 4095)
ALTER TABLE public.sensor_readings 
  ADD COLUMN IF NOT EXISTS gas_raw_adc INT;

-- Add documentation comment explaining hardware metric
COMMENT ON COLUMN public.sensor_readings.gas_raw_adc IS 'MQ-2 Raw 12-bit ADC analog reading (0 - 4095) from ESP32 GPIO 34';

