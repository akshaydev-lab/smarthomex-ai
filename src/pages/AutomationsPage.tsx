import React, { useState } from 'react';
import { 
  Workflow, 
  Plus, 
  ShieldCheck, 
  Zap, 
  Thermometer, 
  Trash2, 
  Cpu, 
  X 
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';

export const AutomationsPage: React.FC = () => {
  const { automations, toggleAutomation, addAutomation, deleteAutomation, devices } = useSmartHome();
  const [filter, setFilter] = useState<'all' | 'safety' | 'comfort' | 'energy'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New rule form state
  const [ruleName, setRuleName] = useState('');
  const [category, setCategory] = useState<'safety' | 'comfort' | 'energy'>('comfort');
  const [conditionSummary, setConditionSummary] = useState('');
  const [actionSummary, setActionSummary] = useState('');
  const [targetDevice, setTargetDevice] = useState(devices[0]?.id || 'relay-1');
  const [isLocalRule, setIsLocalRule] = useState(false);
  const [description, setDescription] = useState('');

  const filteredRules = automations.filter(rule => {
    if (filter === 'all') return true;
    return rule.category === filter;
  });

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName || !conditionSummary || !actionSummary) return;

    addAutomation({
      name: ruleName,
      category,
      triggerType: 'sensor_threshold',
      conditionSummary,
      actionSummary,
      targetDeviceId: targetDevice,
      actionState: true,
      enabled: true,
      isEsp32LocalRule: isLocalRule,
      description: description || 'User-defined automation rule.',
    });

    setIsModalOpen(false);
    // Reset form
    setRuleName('');
    setConditionSummary('');
    setActionSummary('');
    setDescription('');
    setIsLocalRule(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Intelligent Automation Rules</h2>
            <p className="text-xs text-slate-400">
              Sensor threshold triggers, schedule events & autonomous ESP32 fail-safe logic
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setIsModalOpen(true)}
          >
            Create Rule
          </Button>
        </div>
      </Card>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(['all', 'safety', 'comfort', 'energy'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all cursor-pointer ${
              filter === cat
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {cat === 'all' ? 'All Rules' : `${cat} Rules`}
          </button>
        ))}
      </div>

      {/* Rules List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRules.map(rule => (
          <Card 
            key={rule.id}
            className={`transition-all ${
              rule.isEsp32LocalRule 
                ? 'border-teal-500/30 bg-gradient-to-br from-teal-950/20 via-slate-900/80 to-slate-950' 
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className={`p-2 rounded-xl border mt-0.5 ${
                  rule.category === 'safety' 
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' 
                    : rule.category === 'comfort' 
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' 
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                }`}>
                  {rule.category === 'safety' ? (
                    <ShieldCheck className="h-4 w-4" />
                  ) : rule.category === 'comfort' ? (
                    <Thermometer className="h-4 w-4" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-slate-100">{rule.name}</h4>
                    {rule.isEsp32LocalRule && (
                      <Badge variant="teal" size="sm" icon={<Cpu className="h-3 w-3" />}>
                        ESP32 Local Firmware
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{rule.description}</p>
                </div>
              </div>

              {/* Toggle Rule State */}
              <button
                onClick={() => toggleAutomation(rule.id)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out mt-1 ${
                  rule.enabled
                    ? 'bg-cyan-500 border-cyan-400'
                    : 'bg-slate-800 border-slate-700'
                }`}
                role="switch"
                aria-checked={rule.enabled}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow-md ring-0 transition duration-200 ease-in-out mt-0.5 ${
                    rule.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Condition & Action Logic Box */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-bold shrink-0">WHEN:</span>
                <span className="text-slate-200">{rule.conditionSummary}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-teal-400 font-bold shrink-0">THEN:</span>
                <span className="text-teal-300 font-semibold">{rule.actionSummary}</span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="capitalize text-slate-400 font-mono">
                Category: <strong className="text-slate-300">{rule.category}</strong>
              </span>
              <button
                onClick={() => deleteAutomation(rule.id)}
                className="text-slate-400 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                title="Delete rule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Add New Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-lg w-full p-6 border border-cyan-500/30 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-cyan-400" />
                <h3 className="font-bold text-base text-slate-100">Create Automation Rule</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Gas Threshold Safety Trip"
                  className="glass-input w-full px-3 py-2 rounded-xl text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e: any) => setCategory(e.target.value)}
                    className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 bg-slate-900"
                  >
                    <option value="safety">Safety Critical</option>
                    <option value="comfort">Climate Comfort</option>
                    <option value="energy">Energy Saving</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Relay</label>
                  <select
                    value={targetDevice}
                    onChange={(e) => setTargetDevice(e.target.value)}
                    className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 bg-slate-900"
                  >
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} (Ch {d.relayChannel})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Trigger Condition (WHEN)</label>
                <input
                  type="text"
                  required
                  value={conditionSummary}
                  onChange={(e) => setConditionSummary(e.target.value)}
                  placeholder="e.g., IF MQ-2 Sensor > 350 PPM"
                  className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Action Result (THEN)</label>
                <input
                  type="text"
                  required
                  value={actionSummary}
                  onChange={(e) => setActionSummary(e.target.value)}
                  placeholder="e.g., Turn ON Kitchen Exhaust Fan + Sound Siren"
                  className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe the safety or convenience rationale..."
                  className="glass-input w-full px-3 py-2 rounded-xl text-slate-100"
                />
              </div>

              {/* Local firmware checkbox */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="localEspCheckbox"
                  checked={isLocalRule}
                  onChange={(e) => setIsLocalRule(e.target.checked)}
                  className="mt-1 accent-cyan-500 rounded cursor-pointer"
                />
                <label htmlFor="localEspCheckbox" className="text-slate-300 cursor-pointer">
                  <span className="font-bold text-cyan-300 block">
                    Deploy as Local ESP32 RTOS Rule
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Ensures hardware execution continues without delay even if internet or cloud connection fails.
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Save Rule [Demo]
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
