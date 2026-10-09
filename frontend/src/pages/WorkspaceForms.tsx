import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, Sparkles, ExternalLink, Copy, Check,
  Trash2, Loader2, BarChart2, ShieldCheck, ArrowRight
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiRequest } from '../services/api';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';

interface FormItem {
  id: string;
  title: string;
  description: string;
  display_mode: 'classic' | 'one_by_one';
  fields: any[];
  settings: any;
  is_published: boolean;
  submission_count: number;
  last_submission_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function WorkspaceForms() {
  const navigate = useNavigate();
  const { selectedWs } = useWorkspace();

  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Form Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'blank' | 'ai'>('blank');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [displayMode, setDisplayMode] = useState<'classic' | 'one_by_one'>('classic');
  const [aiPrompt, setAiPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedWs?.id) {
      fetchForms();
    }
  }, [selectedWs?.id]);

  const fetchForms = async () => {
    if (!selectedWs?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/workspaces/${selectedWs.id}/forms`);
      setForms(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWs?.id) return;
    setCreating(true);
    setError(null);

    try {
      let payload: any = {
        title: title.trim(),
        description: description.trim(),
        display_mode: displayMode,
        fields: [],
      };

      if (createMode === 'ai') {
        const aiResult = await apiRequest(`/workspaces/${selectedWs.id}/forms/ai-generate`, 'POST', {
          prompt: aiPrompt,
        });

        payload = {
          title: aiResult.title || title || 'AI Generated Form',
          description: aiResult.description || description || `Generated from: "${aiPrompt}"`,
          display_mode: aiResult.display_mode || displayMode,
          fields: aiResult.fields || [],
        };
      }

      const created = await apiRequest(`/workspaces/${selectedWs.id}/forms`, 'POST', payload);
      setShowCreateModal(false);
      resetModalForm();
      navigate(`/workspaces/${selectedWs.id}/forms/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create form');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteForm = async (formId: string, formTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete "${formTitle}" and all its recorded submissions?`)) {
      return;
    }

    try {
      await apiRequest(`/workspaces/${selectedWs?.id}/forms/${formId}`, 'DELETE');
      setForms(forms.filter((f) => f.id !== formId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete form');
    }
  };

  const resetModalForm = () => {
    setTitle('');
    setDescription('');
    setDisplayMode('classic');
    setAiPrompt('');
    setCreateMode('blank');
  };

  const handleCopyLink = (formId: string) => {
    const publicUrl = `${window.location.origin}/f/${formId}`;
    navigator.clipboard.writeText(publicUrl);
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalSubmissions = forms.reduce((acc, f) => acc + (f.submission_count || 0), 0);
  const activeForms = forms.filter((f) => f.is_published).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ClipboardList className="text-brand-600" size={22} />
            Forms &amp; Data Collection
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create high-converting forms, collect lead &amp; survey data, and analyze responses with visual charts
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            resetModalForm();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-1.5 text-xs shadow-sm font-semibold"
        >
          <Plus size={16} /> Create New Form
        </Button>
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {error && <Alert type="error">{error}</Alert>}

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <ClipboardList size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Forms</p>
              <h3 className="text-2xl font-bold text-slate-900">{forms.length}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{activeForms} published &amp; active</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <BarChart2 size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Submissions</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalSubmissions}</h3>
              <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Across all client campaigns</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visitor Tracking</p>
              <h3 className="text-2xl font-bold text-slate-900">Active</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Auto location, country &amp; timezone</p>
            </div>
          </div>
        </div>

        {/* Form List */}
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-brand-600" size={32} />
            <p className="text-sm font-medium text-slate-500">Loading forms...</p>
          </div>
        ) : forms.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={32} />}
            title="No forms created yet"
            description="Create your first form to start capturing leads, customer feedback, and survey responses with automated visitor tracking."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  resetModalForm();
                  setShowCreateModal(true);
                }}
              >
                Create Form
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {forms.map((form) => {
              const publicUrl = `${window.location.origin}/f/${form.id}`;
              const isCopied = copiedId === form.id;

              return (
                <div
                  key={form.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3
                        onClick={() => navigate(`/workspaces/${selectedWs?.id}/forms/${form.id}`)}
                        className="font-bold text-slate-900 hover:text-brand-600 cursor-pointer transition-colors text-base line-clamp-1"
                      >
                        {form.title}
                      </h3>
                      <Badge status={form.is_published ? 'live' : 'draft'} />
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px]">
                      {form.description || 'No description provided.'}
                    </p>

                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                        {form.display_mode === 'one_by_one' ? '✨ One-by-One Step' : '📄 Classic Scroll'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-50 text-brand-700">
                        {form.fields?.length || 0} Fields
                      </span>
                    </div>
                  </div>

                  {/* Card Footer / Stats */}
                  <div className="p-4 bg-slate-50/70 flex items-center justify-between text-xs text-slate-600">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">{form.submission_count || 0}</span>
                      <span className="text-slate-500 ml-1">responses</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyLink(form.id)}
                        title="Copy Public Link"
                        className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
                      >
                        {isCopied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                      </button>

                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open Public Form"
                        className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
                      >
                        <ExternalLink size={15} />
                      </a>

                      <button
                        onClick={() => handleDeleteForm(form.id, form.title)}
                        title="Delete Form"
                        className="p-1.5 rounded-md hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/workspaces/${selectedWs?.id}/forms/${form.id}`)}
                        className="ml-1 text-[11px] py-1 px-2.5 flex items-center gap-1 font-semibold"
                      >
                        Manage <ArrowRight size={12} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Form Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Data Collection Form"
      >
        <div className="space-y-5">
          {/* Create Mode Switcher */}
          <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setCreateMode('blank')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                createMode === 'blank'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList size={14} /> Blank Custom Form
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('ai')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                createMode === 'ai'
                  ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles size={14} /> ✨ Generate with AI Prompt
            </button>
          </div>

          <form onSubmit={handleCreateForm} className="space-y-4">
            {createMode === 'ai' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Describe your form prompt *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Create an agency client intake form asking for company name, website, monthly marketing budget, key goals, and preferred contact time."
                    className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Gemini AI will automatically craft the field types, labels, dropdown options, and flow.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Form Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Lead Contact &amp; Inquiry Form"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief note or intro text for respondents..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Presentation Experience
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`border rounded-lg p-3 cursor-pointer transition-all flex flex-col justify-between ${
                        displayMode === 'classic'
                          ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        checked={displayMode === 'classic'}
                        onChange={() => setDisplayMode('classic')}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 mb-1">
                        📄 Classic Scroll
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Traditional multi-field form with vertical scroll and submit button.
                      </p>
                    </label>

                    <label
                      className={`border rounded-lg p-3 cursor-pointer transition-all flex flex-col justify-between ${
                        displayMode === 'one_by_one'
                          ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        checked={displayMode === 'one_by_one'}
                        onChange={() => setDisplayMode('one_by_one')}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 mb-1">
                        ✨ One-by-One Step
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Typeform-style interactive 1-question per screen with keyboard support.
                      </p>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating} className="flex items-center gap-1.5">
                {creating ? (
                  <>
                    <Loader2 className="animate-spin" size={14} /> Creating...
                  </>
                ) : createMode === 'ai' ? (
                  <>
                    <Sparkles size={14} /> Generate &amp; Open Builder
                  </>
                ) : (
                  'Create Form'
                )}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
