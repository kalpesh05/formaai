import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../services/api';
import { 
  Plus, Trash2, Edit3, Check, X, ShieldAlert, 
  Workflow, Sparkles, RefreshCw 
} from 'lucide-react';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import Alert from '../ui/Alert';

export interface AOPRecord {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  trigger_keywords: string[];
  mandatory_variables: string[];
  steps: string[];
  guardrails: string[];
  escalation_criteria: string[];
  enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

interface AOPStudioProps {
  agentId: string;
}

export default function AOPStudio({ agentId }: AOPStudioProps) {
  const [aops, setAops] = useState<AOPRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editingAop, setEditingAop] = useState<Partial<AOPRecord> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formVars, setFormVars] = useState('');
  const [formSteps, setFormSteps] = useState('');
  const [formGuardrails, setFormGuardrails] = useState('');
  const [formEscalation, setFormEscalation] = useState('');

  useEffect(() => {
    loadAOPs();
  }, [agentId]);

  const loadAOPs = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/aops`, 'GET');
      setAops(res.aops || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load Agent Operating Procedures');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingAop(null);
    setFormName('');
    setFormDesc('');
    setFormKeywords('');
    setFormVars('');
    setFormSteps('');
    setFormGuardrails('');
    setFormEscalation('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (aop: AOPRecord) => {
    setEditingAop(aop);
    setFormName(aop.name);
    setFormDesc(aop.description || '');
    setFormKeywords((aop.trigger_keywords || []).join(', '));
    setFormVars((aop.mandatory_variables || []).join(', '));
    setFormSteps((aop.steps || []).join('\n'));
    setFormGuardrails((aop.guardrails || []).join('\n'));
    setFormEscalation((aop.escalation_criteria || []).join('\n'));
    setIsModalOpen(true);
  };

  const handleToggleEnable = async (aop: AOPRecord) => {
    const newStatus = !aop.enabled;
    try {
      await apiRequest(`/agents/${agentId}/aops/${aop.id}`, 'PUT', {
        enabled: newStatus
      });
      setAops(prev => prev.map(a => a.id === aop.id ? { ...a, enabled: newStatus } : a));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update procedure state');
    }
  };

  const handleDelete = async (aopId: string) => {
    if (!window.confirm('Are you sure you want to delete this Operating Procedure?')) return;
    try {
      await apiRequest(`/agents/${agentId}/aops/${aopId}`, 'DELETE');
      setAops(prev => prev.filter(a => a.id !== aopId));
      setSuccessMsg('Procedure removed successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete procedure');
    }
  };

  const handleSeedDefaults = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/aops/seed-defaults`, 'POST');
      setAops(res.aops || []);
      setSuccessMsg('Default enterprise procedures loaded successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to seed default procedures');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMsg('Procedure name is required');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const payload = {
      name: formName.trim(),
      description: formDesc.trim(),
      trigger_keywords: formKeywords.split(',').map(k => k.trim()).filter(Boolean),
      mandatory_variables: formVars.split(',').map(v => v.trim()).filter(Boolean),
      steps: formSteps.split('\n').map(s => s.trim()).filter(Boolean),
      guardrails: formGuardrails.split('\n').map(g => g.trim()).filter(Boolean),
      escalation_criteria: formEscalation.split('\n').map(e => e.trim()).filter(Boolean),
      enabled: editingAop ? editingAop.enabled : true
    };

    try {
      if (editingAop && editingAop.id) {
        const updated = await apiRequest(`/agents/${agentId}/aops/${editingAop.id}`, 'PUT', payload);
        setAops(prev => prev.map(a => a.id === editingAop.id ? updated : a));
        setSuccessMsg('Procedure updated successfully.');
      } else {
        const created = await apiRequest(`/agents/${agentId}/aops`, 'POST', payload);
        setAops(prev => [...prev, created]);
        setSuccessMsg('New procedure created and activated.');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save procedure');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-brand-50 rounded-lg text-brand-600">
              <Workflow size={20} />
            </div>
            <h2 className="text-base font-bold text-slate-800">Agent Operating Procedures (AOP) Studio</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Enterprise SOP
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Define structured Standard Operating Procedures (SOPs) for specific customer scenarios without writing code or brittle decision trees.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {aops.length === 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSeedDefaults}
              icon={<Sparkles size={14} className="text-brand-600" />}
            >
              Seed Enterprise Defaults
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            icon={<Plus size={15} />}
          >
            New Procedure
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && <Alert type="error">{errorMsg}</Alert>}
      {successMsg && <Alert type="success">{successMsg}</Alert>}

      {/* Content */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <RefreshCw size={24} className="animate-spin text-brand-600" />
          <span className="text-xs font-medium">Loading Operating Procedures...</span>
        </div>
      ) : aops.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8">
          <Workflow size={36} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No Operating Procedures Configured</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            AOPs give your bot exact behavioral rules, prerequisite variables, and escalation guardrails for complex support situations.
          </p>
          <div className="flex justify-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSeedDefaults}
              icon={<Sparkles size={14} />}
            >
              Load Default Enterprise Procedures
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenCreate}
              icon={<Plus size={14} />}
            >
              Create Blank Procedure
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {aops.map((aop) => (
            <div 
              key={aop.id}
              className={`border rounded-xl p-5 transition-all ${
                aop.enabled 
                  ? 'border-slate-200 bg-white hover:border-brand-300 shadow-sm' 
                  : 'border-slate-200 bg-slate-50/60 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{aop.name}</h3>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      v{aop.version || 1}
                    </span>
                    {!aop.enabled && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Paused
                      </span>
                    )}
                  </div>
                  {aop.description && (
                    <p className="text-xs text-slate-500">{aop.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Toggle
                    checked={aop.enabled}
                    onChange={() => handleToggleEnable(aop)}
                  />
                  <button
                    onClick={() => handleOpenEdit(aop)}
                    className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit Procedure"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(aop.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete Procedure"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Keywords & Mandatory Variables */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Triggers:</span>
                {(aop.trigger_keywords || []).map((kw, idx) => (
                  <span key={idx} className="text-[11px] font-mono px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                    {kw}
                  </span>
                ))}

                {aop.mandatory_variables && aop.mandatory_variables.length > 0 && (
                  <>
                    <span className="text-slate-300 mx-1">|</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Required Data:</span>
                    {aop.mandatory_variables.map((v, idx) => (
                      <span key={idx} className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        {v}
                      </span>
                    ))}
                  </>
                )}
              </div>

              {/* Steps and Guardrails Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Workflow size={13} className="text-brand-600" />
                    Procedure Steps ({aop.steps?.length || 0})
                  </span>
                  <ul className="space-y-1 text-slate-600 pl-4 list-decimal list-outside">
                    {(aop.steps || []).map((step, idx) => (
                      <li key={idx} className="leading-relaxed">{step.replace(/^\d+\.\s*/, '')}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert size={13} className="text-amber-600" />
                    Guardrails &amp; Escalation
                  </span>
                  <ul className="space-y-1 text-slate-600 pl-4 list-disc list-outside">
                    {(aop.guardrails || []).map((g, idx) => (
                      <li key={`g-${idx}`} className="text-slate-600 leading-relaxed">{g}</li>
                    ))}
                    {(aop.escalation_criteria || []).map((e, idx) => (
                      <li key={`e-${idx}`} className="text-rose-600 leading-relaxed font-medium">Escalate if: {e}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Workflow size={18} className="text-brand-600" />
                <h3 className="text-base font-bold text-slate-800">
                  {editingAop ? 'Edit Operating Procedure' : 'Create Agent Operating Procedure'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveForm} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Procedure Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Return & Refund Request"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trigger Keywords (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. return, refund, damaged, exchange"
                    value={formKeywords}
                    onChange={(e) => setFormKeywords(e.target.value)}
                    className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Goal</label>
                <input
                  type="text"
                  placeholder="e.g. Handles customer returns, exchanges, and refund validation."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mandatory Customer Data (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. order_number, email_address, return_reason"
                  value={formVars}
                  onChange={(e) => setFormVars(e.target.value)}
                  className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Execution Steps (1 per line)</label>
                <textarea
                  rows={4}
                  placeholder={`1. Ask for order number and email if not provided.\n2. Query customer account state.\n3. If purchase is under 30 days, offer refund options.\n4. Confirm choice with user before filing ticket.`}
                  value={formSteps}
                  onChange={(e) => setFormSteps(e.target.value)}
                  className="w-full rounded-md border-slate-300 border p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Strict Guardrails (1 per line)</label>
                  <textarea
                    rows={3}
                    placeholder={`Never issue refund over $50 without manager approval.\nDo not promise instant bank wire.`}
                    value={formGuardrails}
                    onChange={(e) => setFormGuardrails(e.target.value)}
                    className="w-full rounded-md border-slate-300 border p-2 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Escalation Triggers (1 per line)</label>
                  <textarea
                    rows={3}
                    placeholder={`Customer disputes a charge.\nCustomer requests human manager twice.`}
                    value={formEscalation}
                    onChange={(e) => setFormEscalation(e.target.value)}
                    className="w-full rounded-md border-slate-300 border p-2 text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={saving}
                  icon={<Check size={14} />}
                >
                  {editingAop ? 'Update Procedure' : 'Save & Activate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
