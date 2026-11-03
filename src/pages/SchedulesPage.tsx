import React, { useState } from 'react';
import { 
  CalendarClock, 
  Plus, 
  CheckCircle2, 
  Clock, 
  SlidersHorizontal, 
  Filter, 
  Globe 
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import type { DeviceSchedule } from '../types';
import { ScheduleCard } from '../components/schedules/ScheduleCard';
import { ScheduleModal } from '../components/schedules/ScheduleModal';
import { CalendarScheduleOverview } from '../components/schedules/CalendarScheduleOverview';
import { BackendArchitectureNotice } from '../components/schedules/BackendArchitectureNotice';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';

export const SchedulesPage: React.FC = () => {
  const { 
    schedules, 
    devices, 
    addSchedule, 
    updateSchedule, 
    deleteSchedule, 
    toggleSchedule, 
    executeScheduleNow 
  } = useSmartHome();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<DeviceSchedule | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'completed' | 'disabled'>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');

  const handleOpenCreateModal = () => {
    setEditingSchedule(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (schedule: DeviceSchedule) => {
    setEditingSchedule(schedule);
    setIsModalOpen(true);
  };

  const handleSaveSchedule = (scheduleData: Omit<DeviceSchedule, 'id' | 'createdAt' | 'status'>) => {
    if (editingSchedule) {
      updateSchedule(editingSchedule.id, scheduleData);
    } else {
      addSchedule(scheduleData);
    }
  };

  // Filtered schedules
  const filteredSchedules = schedules.filter(s => {
    // Status filter
    if (statusFilter === 'upcoming' && (s.status !== 'upcoming' || !s.enabled)) return false;
    if (statusFilter === 'completed' && s.status !== 'completed') return false;
    if (statusFilter === 'disabled' && s.enabled) return false;

    // Device filter
    if (deviceFilter !== 'all' && s.deviceId !== deviceFilter) return false;

    return true;
  });

  const activeCount = schedules.filter(s => s.enabled).length;

  return (
    <div className="space-y-6">
      {/* Top Banner Toolbar */}
      <Card className="p-4 sm:p-5 border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 shadow-glow-cyan shrink-0">
              <div className="h-full w-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <CalendarClock className="h-6 w-6 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Device Scheduling & Autonomous Timers
                </h2>
                <Badge variant="demo" size="sm">IST Sandbox</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated ON/OFF schedules for Light, Fan, Water Booster Motor & Kitchen Exhaust Fan
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={handleOpenCreateModal}
          >
            Create New Schedule
          </Button>
        </div>
      </Card>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="p-3.5">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Total Schedules</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-slate-100">{schedules.length}</span>
            <span className="text-xs text-slate-400 font-mono">Tasks</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-mono mt-1 block">4-Channel Relays</span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Active Automated</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-emerald-400">{activeCount}</span>
            <span className="text-xs text-slate-400 font-mono">/ {schedules.length} Armed</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono mt-1 block">Autonomous Execution</span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Execution Timezone</span>
          <div className="text-sm font-bold font-mono text-cyan-300 mt-1 flex items-center gap-1">
            <Globe className="h-3.5 w-3.5 text-cyan-400" /> Asia/Kolkata
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">Indian Standard Time (IST)</span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Idempotency Lock</span>
          <div className="text-sm font-bold font-mono text-teal-300 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" /> Safe Single-Fire
          </div>
          <span className="text-[10px] text-teal-400 font-mono mt-1 block">Prevents Duplicate Pulses</span>
        </Card>
      </div>

      {/* Weekly Calendar Schedule Timeline */}
      <CalendarScheduleOverview 
        schedules={schedules} 
        devices={devices} 
        onSelectSchedule={handleOpenEditModal} 
      />

      {/* Filter and Device Selector Row */}
      <Card className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <SlidersHorizontal className="h-4 w-4 text-cyan-400 shrink-0 mr-1" />
          {[
            { id: 'all', label: 'All Schedules' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Completed' },
            { id: 'disabled', label: 'Disabled' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Device Select Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="glass-input px-3 py-1.5 rounded-xl text-xs text-slate-200 bg-slate-900"
          >
            <option value="all">All Devices (4 Relays)</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} (Ch {d.relayChannel})
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Schedules Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSchedules.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">
            <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-300">No schedules found matching this filter.</p>
            <p className="mt-1">Click "Create New Schedule" to automate your home devices.</p>
          </div>
        ) : (
          filteredSchedules.map(schedule => {
            const device = devices.find(d => d.id === schedule.deviceId);
            return (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                device={device}
                onEdit={handleOpenEditModal}
                onDelete={deleteSchedule}
                onToggle={toggleSchedule}
                onExecuteNow={executeScheduleNow}
              />
            );
          })
        )}
      </div>

      {/* Cloud & Hardware Scheduler Architecture Notice */}
      <BackendArchitectureNotice />

      {/* Modal for Creating / Editing Schedules */}
      <ScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSchedule}
        editingSchedule={editingSchedule}
        devices={devices}
      />
    </div>
  );
};
