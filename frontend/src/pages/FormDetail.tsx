import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Sparkles, ExternalLink, Copy, Check,
  Trash2, Plus, MoveUp, MoveDown, BarChart2, Table, Settings,
  Code, Loader2, Star, Globe, Clock, Download, Search,
  RefreshCw, Smartphone, Monitor
} from 'lucide-react';
import { apiRequest } from '../services/api';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';

interface FormField {
  id: string;
  type: 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'dropdown' | 'multiple_choice' | 'rating' | 'date';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  help_text?: string;
}

interface FormSettings {
  brand_color: string;
  logo_url?: string;
  theme: 'light' | 'dark';
  submit_button_text: string;
  thank_you_title: string;
  thank_you_message: string;
  redirect_url?: string;
  show_forma_badge: boolean;
}

interface FormRecord {
  id: string;
  title: string;
  description: string;
  display_mode: 'classic' | 'one_by_one';
  fields: FormField[];
  settings: FormSettings;
  is_published: boolean;
  submission_count: number;
}

export default function FormDetail() {
  const { wsId, formId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'builder' | 'submissions' | 'analytics' | 'embed'>('builder');
  const [form, setForm] = useState<FormRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Submissions State
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);

  // Analytics State
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // AI Field Prompt in Builder
  const [aiFieldPrompt, setAiFieldPrompt] = useState('');
  const [aiGeneratingField, setAiGeneratingField] = useState(false);

  useEffect(() => {
    if (wsId && formId) {
      loadFormData();
    }
  }, [wsId, formId]);

  useEffect(() => {
    if (activeTab === 'submissions') {
      fetchSubmissions();
    } else if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab, statusFilter, searchQuery]);

  const loadFormData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/forms/${formId}`);
      setForm(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      let query = `?status=${statusFilter}`;
      if (searchQuery.trim()) query += `&search=${encodeURIComponent(searchQuery.trim())}`;
      const data = await apiRequest(`/workspaces/${wsId}/forms/${formId}/submissions${query}`);
      setSubmissions(data.submissions || []);
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/forms/${formId}/analytics`);
      setAnalytics(data);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleGenerateAiInsights = async () => {
    setAiLoading(true);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/forms/${formId}/ai-insights`, 'POST');
      setAiInsights(data);
    } catch (err: any) {
      alert(err.message || 'Failed to generate AI insights');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveForm = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiRequest(`/workspaces/${wsId}/forms/${formId}`, 'PUT', {
        title: form.title,
        description: form.description,
        display_mode: form.display_mode,
        fields: form.fields,
        settings: form.settings,
        is_published: form.is_published,
      });
      setForm(updated);
      setSuccessMsg('Form successfully saved!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  /* Field Management Handlers */
  const handleAddField = (type: FormField['type']) => {
    if (!form) return;
    const newId = `f_${Date.now()}`;
    const defaultLabels: Record<FormField['type'], string> = {
      short_text: 'What is your full name?',
      long_text: 'Please share your details or questions',
      email: 'What is your email address?',
      phone: 'What is your phone number?',
      number: 'Enter a number or amount',
      dropdown: 'Select one of the options below',
      multiple_choice: 'Which of the following applies to you?',
      rating: 'How would you rate your overall experience?',
      date: 'Select your preferred date',
    };

    const newField: FormField = {
      id: newId,
      type,
      label: defaultLabels[type] || 'Untitled Question',
      placeholder: type === 'email' ? 'name@example.com' : 'Type your answer...',
      required: false,
      options: ['dropdown', 'multiple_choice'].includes(type) ? ['Option 1', 'Option 2', 'Option 3'] : undefined,
    };

    setForm({
      ...form,
      fields: [...form.fields, newField],
    });
  };

  const handleUpdateField = (index: number, patch: Partial<FormField>) => {
    if (!form) return;
    const nextFields = [...form.fields];
    nextFields[index] = { ...nextFields[index], ...patch };
    setForm({ ...form, fields: nextFields });
  };

  const handleDeleteField = (index: number) => {
    if (!form) return;
    const nextFields = form.fields.filter((_, i) => i !== index);
    setForm({ ...form, fields: nextFields });
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (!form) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= form.fields.length) return;
    const nextFields = [...form.fields];
    const temp = nextFields[index];
    nextFields[index] = nextFields[target];
    nextFields[target] = temp;
    setForm({ ...form, fields: nextFields });
  };

  const handleAiSuggestFields = async () => {
    if (!aiFieldPrompt.trim() || !form) return;
    setAiGeneratingField(true);
    try {
      const result = await apiRequest(`/workspaces/${wsId}/forms/ai-generate`, 'POST', {
        prompt: `Add 3 relevant questions to this existing form ("${form.title}") based on: "${aiFieldPrompt}"`,
      });
      if (result.fields && Array.isArray(result.fields)) {
        setForm({
          ...form,
          fields: [...form.fields, ...result.fields],
        });
        setAiFieldPrompt('');
      }
    } catch (err: any) {
      alert(err.message || 'AI field suggestion failed');
    } finally {
      setAiGeneratingField(false);
    }
  };

  /* Export Submissions to CSV */
  const handleExportCSV = () => {
    if (!form || submissions.length === 0) return;

    // Headers: Date, Status, Country, Timezone, Device, + all form fields
    const fieldHeaders = form.fields.map((f) => f.label.replace(/"/g, '""'));
    const headers = ['Submitted At', 'Status', 'Country', 'City', 'Timezone', 'Device', ...fieldHeaders];

    const rows = submissions.map((s) => {
      const meta = s.metadata || {};
      const answers = s.answers || {};

      const fieldValues = form.fields.map((f) => {
        const val = answers[f.id];
        if (val === undefined || val === null) return '""';
        if (Array.isArray(val)) return `"${val.join(', ').replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      });

      return [
        `"${new Date(s.created_at).toLocaleString()}"`,
        `"${s.status}"`,
        `"${meta.country || 'Unknown'}"`,
        `"${meta.city || 'Unknown'}"`,
        `"${meta.timezone || 'UTC'}"`,
        `"${meta.device || 'Desktop'}"`,
        ...fieldValues,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.map((h) => `"${h}"`).join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${form.title.toLowerCase().replace(/\s+/g, '_')}_submissions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateSubmissionStatus = async (subId: string, status: string) => {
    try {
      await apiRequest(`/workspaces/${wsId}/forms/${formId}/submissions/${subId}/status`, 'PATCH', { status });
      setSubmissions(submissions.map((s) => (s.id === subId ? { ...s, status } : s)));
      if (selectedSubmission?.id === subId) {
        setSelectedSubmission({ ...selectedSubmission, status });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const publicUrl = `${window.location.origin}/f/${formId}`;
  const embedIframeCode = `<iframe\n  src="${publicUrl}"\n  width="100%"\n  height="650"\n  frameborder="0"\n  style="border: none; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);"\n></iframe>`;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <p className="text-sm font-medium text-slate-500">Loading form builder &amp; dataset...</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex-1 p-8 bg-slate-50">
        <Alert type="error">Form not found or inaccessible</Alert>
        <Button variant="secondary" onClick={() => navigate(`/workspaces/${wsId}/forms`)} className="mt-4">
          <ArrowLeft size={16} /> Back to Forms
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/workspaces/${wsId}/forms`)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
            title="Back to Forms"
          >
            <ArrowLeft size={18} />
          </button>

          <div>
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="text-lg font-bold text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-brand-500 px-1.5 py-0.5 rounded transition-colors"
              />
              <Badge status={form.is_published ? 'live' : 'draft'} />
            </div>
            <p className="text-xs text-slate-400 pl-1.5">
              {form.fields.length} questions • {form.display_mode === 'one_by_one' ? 'One-by-One Step' : 'Classic Scroll'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              navigator.clipboard.writeText(publicUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copiedLink ? 'Copied Link' : 'Copy Link'}
          </button>

          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <ExternalLink size={14} /> Open Public Form
          </a>

          <Button
            variant="primary"
            onClick={handleSaveForm}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold shadow-sm"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-slate-200 px-8 flex gap-8">
        <button
          onClick={() => setActiveTab('builder')}
          className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'builder'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings size={15} /> Form Builder &amp; Design
        </button>

        <button
          onClick={() => setActiveTab('submissions')}
          className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'submissions'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Table size={15} /> Submissions Data Grid ({form.submission_count || 0})
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'analytics'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart2 size={15} /> Visual Charts &amp; AI Analytics
        </button>

        <button
          onClick={() => setActiveTab('embed')}
          className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'embed'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Code size={15} /> Embed &amp; Share
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-8">
        {error && <Alert type="error" className="mb-6">{error}</Alert>}
        {successMsg && <Alert type="success" className="mb-6">{successMsg}</Alert>}

        {/* ── TAB 1: FORM BUILDER ── */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 2 Cols: Questions List & Field Editor */}
            <div className="lg:col-span-2 space-y-6">
              {/* Form Overview Card */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Form Subtitle / Intro Message
                  </label>
                  <textarea
                    rows={2}
                    value={form.description || ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Welcome your respondents with clear instructions..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                {/* AI Add Questions Prompt */}
                <div className="bg-gradient-to-r from-brand-50 to-indigo-50 p-4 rounded-xl border border-brand-100 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-brand-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Sparkles size={18} />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={aiFieldPrompt}
                      onChange={(e) => setAiFieldPrompt(e.target.value)}
                      placeholder="✨ Ask Gemini AI to generate more questions (e.g. Add budget and timeline questions)"
                      className="w-full bg-white px-3 py-1.5 text-xs rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAiSuggestFields();
                      }}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleAiSuggestFields}
                    disabled={aiGeneratingField || !aiFieldPrompt.trim()}
                    className="text-xs py-1.5 px-3 flex items-center gap-1 font-semibold flex-shrink-0"
                  >
                    {aiGeneratingField ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
                    Generate
                  </Button>
                </div>
              </div>

              {/* Add Field Palette Bar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  Click to Add a Question Field
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { type: 'short_text', label: 'Short Text' },
                    { type: 'long_text', label: 'Paragraph' },
                    { type: 'email', label: 'Email' },
                    { type: 'phone', label: 'Phone' },
                    { type: 'dropdown', label: 'Dropdown' },
                    { type: 'multiple_choice', label: 'Choice Cards' },
                    { type: 'rating', label: 'Rating (1-5★)' },
                    { type: 'date', label: 'Date' },
                    { type: 'number', label: 'Number' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => handleAddField(item.type as FormField['type'])}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 text-slate-700 text-xs font-medium transition-all shadow-2xs flex items-center gap-1.5"
                    >
                      <Plus size={13} /> {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fields List */}
              <div className="space-y-4">
                {form.fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-slate-300 transition-colors space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                          {field.type.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveField(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-500"
                          title="Move Up"
                        >
                          <MoveUp size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveField(idx, 'down')}
                          disabled={idx === form.fields.length - 1}
                          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-500"
                          title="Move Down"
                        >
                          <MoveDown size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteField(idx)}
                          className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors ml-1"
                          title="Delete Field"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Question Label */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Question Title *</label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                      />
                    </div>

                    {/* Placeholder */}
                    {!['rating', 'date'].includes(field.type) && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Placeholder Text</label>
                        <input
                          type="text"
                          value={field.placeholder || ''}
                          onChange={(e) => handleUpdateField(idx, { placeholder: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-600"
                        />
                      </div>
                    )}

                    {/* Choices Options Manager */}
                    {['dropdown', 'multiple_choice'].includes(field.type) && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Choices (One per option)
                        </label>
                        <div className="space-y-1.5">
                          {(field.options || []).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const nextOpts = [...(field.options || [])];
                                  nextOpts[optIdx] = e.target.value;
                                  handleUpdateField(idx, { options: nextOpts });
                                }}
                                className="flex-1 px-3 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextOpts = (field.options || []).filter((_, i) => i !== optIdx);
                                  handleUpdateField(idx, { options: nextOpts });
                                }}
                                className="p-1 hover:text-rose-600 text-slate-400"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpts = [...(field.options || []), `Option ${(field.options || []).length + 1}`];
                              handleUpdateField(idx, { options: nextOpts });
                            }}
                            className="text-xs text-brand-600 font-semibold hover:underline pt-1 flex items-center gap-1"
                          >
                            <Plus size={13} /> Add Choice
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Required Checkbox */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleUpdateField(idx, { required: e.target.checked })}
                          className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                        />
                        Required answer
                      </label>

                      <span className="text-[11px] text-slate-400 font-mono">ID: {field.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 1 Col: Presentation & White-Label Settings */}
            <div className="space-y-6">
              {/* Presentation Mode Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Presentation Mode</h3>

                <div className="space-y-2">
                  <label
                    className={`border rounded-lg p-3 cursor-pointer transition-all flex items-start gap-3 ${
                      form.display_mode === 'classic'
                        ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="display_mode"
                      checked={form.display_mode === 'classic'}
                      onChange={() => setForm({ ...form, display_mode: 'classic' })}
                      className="sr-only"
                    />
                    <div className="mt-0.5">📄</div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Classic Scroll</div>
                      <div className="text-[11px] text-slate-500">
                        All questions visible on a single page with smooth vertical scroll.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`border rounded-lg p-3 cursor-pointer transition-all flex items-start gap-3 ${
                      form.display_mode === 'one_by_one'
                        ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="display_mode"
                      checked={form.display_mode === 'one_by_one'}
                      onChange={() => setForm({ ...form, display_mode: 'one_by_one' })}
                      className="sr-only"
                    />
                    <div className="mt-0.5">✨</div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">One-by-One Step</div>
                      <div className="text-[11px] text-slate-500">
                        Typeform-style full-screen question steps with progress bar &amp; keyboard enter navigation.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* White-Label Branding Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  White-Label Branding
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Brand Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.settings.brand_color || '#2563eb'}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          settings: { ...form.settings, brand_color: e.target.value },
                        })
                      }
                      className="h-8 w-12 rounded cursor-pointer border border-slate-300 p-0"
                    />
                    <input
                      type="text"
                      value={form.settings.brand_color || '#2563eb'}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          settings: { ...form.settings, brand_color: e.target.value },
                        })
                      }
                      className="flex-1 px-3 py-1 text-xs border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Logo URL (Optional)</label>
                  <input
                    type="url"
                    value={form.settings.logo_url || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, logo_url: e.target.value },
                      })
                    }
                    placeholder="https://client.com/logo.png"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Submit Button Label</label>
                  <input
                    type="text"
                    value={form.settings.submit_button_text || 'Submit Response'}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, submit_button_text: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Thank You Title</label>
                  <input
                    type="text"
                    value={form.settings.thank_you_title || 'Thank you!'}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, thank_you_title: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Thank You Message</label>
                  <textarea
                    rows={2}
                    value={form.settings.thank_you_message || 'Your submission has been received.'}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, thank_you_message: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Redirect URL on Submit (Optional)
                  </label>
                  <input
                    type="url"
                    value={form.settings.redirect_url || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, redirect_url: e.target.value },
                      })
                    }
                    placeholder="https://client.com/booking-success"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-700 font-medium">Show Forma AI badge</span>
                  <input
                    type="checkbox"
                    checked={form.settings.show_forma_badge !== false}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, show_forma_badge: e.target.checked },
                      })
                    }
                    className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                  />
                </div>
              </div>

              {/* Status / Publish Toggle */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Published Status</h4>
                  <p className="text-[11px] text-slate-500">Live forms accept respondent answers.</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                  className="h-5 w-5 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: SUBMISSIONS NOTION/AIRTABLE DATA GRID ── */}
        {activeTab === 'submissions' && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search answers..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchSubmissions}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <RefreshCw size={13} className={submissionsLoading ? 'animate-spin' : ''} /> Refresh
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={submissions.length === 0}
                  className="flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Download size={13} /> Export CSV
                </Button>
              </div>
            </div>

            {/* Submissions Table */}
            {submissionsLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-slate-200">
                <Loader2 className="animate-spin text-brand-600" size={24} />
                <p className="text-xs text-slate-500">Loading submissions...</p>
              </div>
            ) : submissions.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Table size={32} className="mx-auto text-slate-300 mb-2" />
                <h3 className="text-sm font-bold text-slate-900">No submissions recorded</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Once respondents fill out your public form, their answers, location, and timezone will populate here.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3">Submitted</th>
                        <th className="p-3">Location &amp; Zone</th>
                        <th className="p-3">Status</th>
                        {form.fields.slice(0, 4).map((f) => (
                          <th key={f.id} className="p-3 max-w-[180px] truncate" title={f.label}>
                            {f.label}
                          </th>
                        ))}
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {submissions.map((sub, idx) => {
                        const meta = sub.metadata || {};
                        const answers = sub.answers || {};

                        return (
                          <tr
                            key={sub.id}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                            onClick={() => setSelectedSubmission(sub)}
                          >
                            <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                            <td className="p-3 text-slate-900 font-medium whitespace-nowrap">
                              {new Date(sub.created_at).toLocaleDateString()}{' '}
                              <span className="text-[10px] text-slate-400">
                                {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Globe size={13} className="text-slate-400" />
                                <span className="font-semibold text-slate-800">{meta.country || 'Unknown'}</span>
                                {meta.city && <span className="text-slate-500 text-[11px]">({meta.city})</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock size={11} /> {meta.timezone || 'UTC'}
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  sub.status === 'new'
                                    ? 'bg-brand-50 text-brand-700'
                                    : sub.status === 'reviewed'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {sub.status}
                              </span>
                            </td>

                            {/* First 4 Field Answers */}
                            {form.fields.slice(0, 4).map((f) => {
                              const val = answers[f.id];
                              let displayVal = '-';
                              if (val !== undefined && val !== null) {
                                displayVal = Array.isArray(val) ? val.join(', ') : String(val);
                              }
                              return (
                                <td key={f.id} className="p-3 max-w-[180px] truncate" title={displayVal}>
                                  {f.type === 'rating' && val ? (
                                    <div className="flex items-center text-amber-500 font-bold gap-1">
                                      <Star size={12} fill="currentColor" /> {val} / 5
                                    </div>
                                  ) : (
                                    displayVal
                                  )}
                                </td>
                              );
                            })}

                            <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setSelectedSubmission(sub)}
                                className="text-[11px] py-1 px-2.5"
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: VISUAL CHARTS & AI ANALYTICS ── */}
        {activeTab === 'analytics' && (
          analyticsLoading && !analytics ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 bg-white rounded-xl border border-slate-200">
              <Loader2 className="animate-spin text-brand-600" size={24} />
              <p className="text-xs text-slate-500">Computing visual analytics &amp; charts...</p>
            </div>
          ) : (
          <div className="space-y-8">
            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Submissions</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {analytics?.total_submissions || 0}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">All-time recorded responses</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top Country</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {analytics?.top_countries?.[0]?.country || 'N/A'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {analytics?.top_countries?.[0]?.count ? `${analytics.top_countries[0].count} responses` : 'No location data'}
                </p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Device Breakdown</p>
                <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1 text-sm text-slate-700">
                    <Monitor size={15} /> {analytics?.device_counts?.Desktop || 0}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-slate-700">
                    <Smartphone size={15} /> {analytics?.device_counts?.Mobile || 0}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Desktop vs Mobile respondents</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Review Pipeline</p>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                  {analytics?.new_count || 0} New
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{analytics?.reviewed_count || 0} reviewed</p>
              </div>
            </div>

            {/* AI Insights Synthesis Card */}
            <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-brand-950 text-white p-6 rounded-2xl shadow-md border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Forma AI Qualitative Insights
                    </h3>
                    <p className="text-xs text-slate-400">
                      Gemini reads open-ended customer feedback and synthesizes sentiment &amp; patterns
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleGenerateAiInsights}
                  disabled={aiLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
                >
                  {aiLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  {aiLoading ? 'Synthesizing...' : 'Analyze with AI'}
                </Button>
              </div>

              {aiInsights ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Executive Summary</span>
                    <p className="text-slate-200 mt-1 text-sm leading-relaxed">{aiInsights.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/10">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Key Themes</span>
                      <ul className="mt-1 space-y-1 text-slate-300 list-disc list-inside">
                        {aiInsights.key_themes?.map((t: string, i: number) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Action Recommendations</span>
                      <ul className="mt-1 space-y-1 text-slate-300 list-disc list-inside">
                        {aiInsights.recommendations?.map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-slate-400 flex items-center gap-2">
                  <span>Click "Analyze with AI" above to generate a synthesized summary of responses using Gemini.</span>
                </div>
              )}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Daily Submission Volume Trend */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Submission Trend Over Time</h4>
                  <span className="text-xs text-slate-400">Timeline volume</span>
                </div>

                {analytics?.time_series && analytics.time_series.length > 0 ? (
                  <div className="space-y-2">
                    <div className="h-44 flex items-end gap-2 pt-6 pb-2 border-b border-slate-200">
                      {analytics.time_series.map((item: any, i: number) => {
                        const max = Math.max(...analytics.time_series.map((t: any) => t.count), 1);
                        const pct = Math.max(10, Math.round((item.count / max) * 100));
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                            <span className="text-[10px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              {item.count}
                            </span>
                            <div
                              style={{ height: `${pct}%` }}
                              className="w-full max-w-[28px] bg-brand-500 group-hover:bg-brand-600 rounded-t transition-all"
                            />
                            <span className="text-[9px] text-slate-400 truncate w-full text-center">
                              {item.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-slate-400">
                    No time-series data recorded yet.
                  </div>
                )}
              </div>

              {/* Geographic & Timezone Distribution */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Top Respondent Countries</h4>
                  <span className="text-xs text-slate-400">Auto-detected location</span>
                </div>

                {analytics?.top_countries && analytics.top_countries.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.top_countries.map((c: any, i: number) => {
                      const max = analytics.top_countries[0].count;
                      const pct = Math.round((c.count / max) * 100);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-slate-700">
                            <span className="flex items-center gap-1.5">
                              <Globe size={13} className="text-brand-500" /> {c.country}
                            </span>
                            <span className="text-slate-500">{c.count} ({pct}%)</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div style={{ width: `${pct}%` }} className="h-full bg-brand-600 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-slate-400">
                    No location data available yet.
                  </div>
                )}
              </div>
            </div>

            {/* Categorical Questions Answer Distribution */}
            {analytics?.categorical_stats && Object.keys(analytics.categorical_stats).length > 0 && (
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-900">Choices &amp; Dropdown Answer Breakdown</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(analytics.categorical_stats).map(([fieldId, data]: [string, any]) => {
                    const totalVotes = Object.values(data.counts).reduce((a: any, b: any) => a + b, 0) as number;

                    return (
                      <div key={fieldId} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h5 className="text-xs font-bold text-slate-900 line-clamp-1">{data.label}</h5>
                        <p className="text-[11px] text-slate-400">{totalVotes} total responses for this question</p>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          {Object.entries(data.counts).map(([opt, count]: [string, any]) => {
                            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                            return (
                              <div key={opt} className="space-y-1">
                                <div className="flex justify-between text-xs text-slate-700">
                                  <span className="truncate max-w-[200px]">{opt}</span>
                                  <span className="font-semibold text-slate-900">{count} ({pct}%)</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div style={{ width: `${pct}%` }} className="h-full bg-indigo-500 rounded-full" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ratings Breakdown */}
            {analytics?.rating_stats && Object.keys(analytics.rating_stats).length > 0 && (
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-900">Satisfaction &amp; Star Ratings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(analytics.rating_stats).map(([fieldId, r]: [string, any]) => (
                    <div key={fieldId} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-6">
                      <div className="text-center pr-6 border-r border-slate-100">
                        <h3 className="text-4xl font-extrabold text-amber-500">{r.avg || '0.0'}</h3>
                        <div className="flex items-center text-amber-500 justify-center mt-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={14}
                              fill={s <= Math.round(r.avg) ? 'currentColor' : 'none'}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{r.total} ratings</p>
                      </div>

                      <div className="flex-1 space-y-1 text-xs">
                        {['5', '4', '3', '2', '1'].map((star) => {
                          const count = r.distribution?.[star] || 0;
                          const pct = r.total > 0 ? Math.round((count / r.total) * 100) : 0;
                          return (
                            <div key={star} className="flex items-center gap-2">
                              <span className="w-6 text-[11px] text-slate-500 font-medium">{star}★</span>
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div style={{ width: `${pct}%` }} className="h-full bg-amber-400 rounded-full" />
                              </div>
                              <span className="w-8 text-[11px] text-slate-400 text-right">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )
        )}

        {/* ── TAB 4: SHARE & EMBED ── */}
        {activeTab === 'embed' && (
          <div className="max-w-3xl space-y-8">
            {/* Share Public Link Card */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Hosted Public Link</h3>
              <p className="text-xs text-slate-500">
                Share this direct URL with your clients, include it in email campaigns, or link it in social bios.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono"
                />
                <Button
                  variant="primary"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold"
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Copied' : 'Copy'}
                </Button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1"
                >
                  <ExternalLink size={14} /> Visit
                </a>
              </div>
            </div>

            {/* Iframe Embed Card */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">HTML Iframe Embed Code</h3>
              <p className="text-xs text-slate-500">
                Paste this snippet directly into Webflow, WordPress, Wix, Shopify, or any custom website HTML:
              </p>

              <div className="relative">
                <pre className="bg-slate-900 text-slate-200 p-4 rounded-lg text-xs font-mono overflow-x-auto">
                  {embedIframeCode}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(embedIframeCode);
                    setCopiedEmbed(true);
                    setTimeout(() => setCopiedEmbed(false), 2000);
                  }}
                  className="absolute top-3 right-3 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold flex items-center gap-1 border border-slate-700 transition-colors"
                >
                  {copiedEmbed ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedEmbed ? 'Copied' : 'Copy Code'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submission Detail Inspector Modal */}
      {selectedSubmission && (
        <Modal
          isOpen={!!selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          title="Submission Details"
        >
          <div className="space-y-5 text-xs">
            {/* Meta row */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Submitted At</span>
                <p className="font-semibold text-slate-900">
                  {new Date(selectedSubmission.created_at).toLocaleString()}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Location</span>
                <p className="font-semibold text-slate-900 flex items-center gap-1">
                  <Globe size={13} className="text-brand-500" />
                  {selectedSubmission.metadata?.country || 'Unknown'}{' '}
                  {selectedSubmission.metadata?.city && `(${selectedSubmission.metadata.city})`}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Timezone</span>
                <p className="font-semibold text-slate-900">
                  {selectedSubmission.metadata?.timezone || 'UTC'}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Status</span>
                <div className="mt-0.5">
                  <select
                    value={selectedSubmission.status}
                    onChange={(e) => handleUpdateSubmissionStatus(selectedSubmission.id, e.target.value)}
                    className="px-2 py-0.5 text-xs font-semibold rounded border border-slate-300 bg-white"
                  >
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Answer List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1">
                Respondent Answers
              </h4>

              {form.fields.map((f) => {
                const answer = selectedSubmission.answers?.[f.id];
                return (
                  <div key={f.id} className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">{f.label}</span>
                    <div className="text-xs font-medium text-slate-900">
                      {answer === undefined || answer === null || answer === '' ? (
                        <span className="text-slate-400 italic">No answer provided</span>
                      ) : f.type === 'rating' ? (
                        <div className="flex items-center text-amber-500 font-bold gap-1">
                          <Star size={13} fill="currentColor" /> {answer} / 5 Stars
                        </div>
                      ) : Array.isArray(answer) ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {answer.map((item: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[11px]">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{String(answer)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Technical Metadata */}
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
              <p>Device: {selectedSubmission.metadata?.device || 'Desktop'}</p>
              <p className="truncate">User Agent: {selectedSubmission.metadata?.user_agent || 'N/A'}</p>
              <p>Referrer: {selectedSubmission.metadata?.referrer || 'Direct'}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
