import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle, Loader2, ArrowRight, ArrowLeft, Star,
  AlertCircle
} from 'lucide-react';

interface PublicField {
  id: string;
  type: 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'dropdown' | 'multiple_choice' | 'rating' | 'date';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  help_text?: string;
}

interface PublicFormDefinition {
  id: string;
  title: string;
  description: string;
  display_mode: 'classic' | 'one_by_one';
  fields: PublicField[];
  settings: {
    brand_color: string;
    logo_url?: string;
    theme: 'light' | 'dark';
    submit_button_text: string;
    thank_you_title: string;
    thank_you_message: string;
    redirect_url?: string;
    show_forma_badge: boolean;
  };
}

export default function PublicFormView() {
  const { formId } = useParams();

  const [form, setForm] = useState<PublicFormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form State
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // One-by-One Step Navigation
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (formId) {
      loadPublicForm();
    }
  }, [formId]);

  const loadPublicForm = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const host = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000';
      const res = await fetch(`${host}/api/v1/forms/public/${formId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'This form is closed or does not exist');
      }
      const data = await res.json();
      setForm(data);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: val }));
    if (validationErrors[fieldId]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const validateCurrentField = (field: PublicField): boolean => {
    if (field.required) {
      const val = answers[field.id];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        setValidationErrors((prev) => ({ ...prev, [field.id]: 'This field is required' }));
        return false;
      }
      if (field.type === 'email' && typeof val === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        setValidationErrors((prev) => ({ ...prev, [field.id]: 'Please enter a valid email address' }));
        return false;
      }
    }
    return true;
  };

  const validateAllFields = (): boolean => {
    if (!form) return false;
    const errors: Record<string, string> = {};
    form.fields.forEach((f) => {
      if (f.required) {
        const val = answers[f.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          errors[f.id] = 'This field is required';
        } else if (f.type === 'email' && typeof val === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          errors[f.id] = 'Please enter a valid email address';
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form) return;

    if (!validateAllFields()) {
      return;
    }

    setSubmitting(true);
    try {
      // Sniff browser client timezone
      let clientTz = 'UTC';
      try {
        clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch (_) {}

      const host = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000';
      const res = await fetch(`${host}/api/v1/forms/public/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          client_metadata: {
            timezone: clientTz,
            referrer: document.referrer || null,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to submit form');
      }

      const result = await res.json();
      setSubmitted(true);

      if (result.redirect_url) {
        setTimeout(() => {
          window.location.href = result.redirect_url;
        }, 2000);
      }
    } catch (err: any) {
      alert(err.message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard navigation for One-by-One mode
  const handleKeyDownOneByOne = (e: React.KeyboardEvent, field: PublicField) => {
    if (e.key === 'Enter' && field.type !== 'long_text') {
      e.preventDefault();
      handleNextStep();
    }
  };

  const handleNextStep = () => {
    if (!form) return;
    const currentField = form.fields[currentStep];
    if (currentField && !validateCurrentField(currentField)) {
      return;
    }

    if (currentStep < form.fields.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-blue-600 mb-3" size={36} />
        <p className="text-sm font-medium text-slate-500">Loading form...</p>
      </div>
    );
  }

  if (fetchError || !form) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Form Unavailable</h2>
          <p className="text-xs text-slate-500">{fetchError || 'This form is no longer accepting responses.'}</p>
        </div>
      </div>
    );
  }

  const brandColor = form.settings.brand_color || '#2563eb';

  /* Render Single Question Field Component */
  const renderFieldInput = (field: PublicField, isStepMode = false) => {
    const error = validationErrors[field.id];
    const value = answers[field.id] || '';

    switch (field.type) {
      case 'short_text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <div className="space-y-1.5">
            <input
              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              onKeyDown={(e) => isStepMode && handleKeyDownOneByOne(e, field)}
              placeholder={field.placeholder || 'Type your answer here...'}
              className={`w-full ${
                isStepMode
                  ? 'text-lg sm:text-xl py-3 px-4 rounded-xl border-2'
                  : 'text-sm py-2.5 px-3.5 rounded-lg border'
              } transition-all focus:outline-none bg-white ${
                error ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-blue-600'
              }`}
              style={{
                borderColor: !error && value ? brandColor : undefined,
              }}
              autoFocus={isStepMode}
            />
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>
        );

      case 'long_text':
        return (
          <div className="space-y-1.5">
            <textarea
              rows={isStepMode ? 4 : 3}
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              placeholder={field.placeholder || 'Type your message here...'}
              className={`w-full ${
                isStepMode
                  ? 'text-base sm:text-lg py-3 px-4 rounded-xl border-2'
                  : 'text-sm py-2.5 px-3.5 rounded-lg border'
              } transition-all focus:outline-none bg-white ${
                error ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-blue-600'
              }`}
              style={{
                borderColor: !error && value ? brandColor : undefined,
              }}
              autoFocus={isStepMode}
            />
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>
        );

      case 'dropdown':
        return (
          <div className="space-y-1.5">
            <select
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              className={`w-full ${
                isStepMode
                  ? 'text-base sm:text-lg py-3 px-4 rounded-xl border-2'
                  : 'text-sm py-2.5 px-3.5 rounded-lg border'
              } transition-all focus:outline-none bg-white ${
                error ? 'border-rose-400' : 'border-slate-300'
              }`}
            >
              <option value="">Select an option...</option>
              {(field.options || []).map((opt, i) => (
                <option key={i} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>
        );

      case 'multiple_choice':
        return (
          <div className="space-y-2">
            <div className={`grid ${isStepMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-2.5`}>
              {(field.options || []).map((opt, i) => {
                const isSelected = value === opt;
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => {
                      handleInputChange(field.id, opt);
                      if (isStepMode) {
                        setTimeout(() => handleNextStep(), 250);
                      }
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-2 shadow-sm font-semibold'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                    style={{
                      borderColor: isSelected ? brandColor : undefined,
                      backgroundColor: isSelected ? `${brandColor}10` : undefined,
                    }}
                  >
                    <span className="text-xs sm:text-sm text-slate-800">{opt}</span>
                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-transparent' : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: isSelected ? brandColor : undefined }}
                    >
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>
        );

      case 'rating':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = Number(value) >= star;
                return (
                  <button
                    type="button"
                    key={star}
                    onClick={() => {
                      handleInputChange(field.id, star);
                      if (isStepMode) {
                        setTimeout(() => handleNextStep(), 250);
                      }
                    }}
                    className="p-1 hover:scale-110 transition-transform text-amber-400 focus:outline-none"
                  >
                    <Star
                      size={isStepMode ? 36 : 28}
                      fill={isFilled ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth={1.5}
                    />
                  </button>
                );
              })}
              {value > 0 && (
                <span className="text-xs sm:text-sm font-bold text-slate-700 ml-2">
                  {value} of 5
                </span>
              )}
            </div>
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>
        );

      case 'date':
        return (
          <div className="space-y-1.5">
            <input
              type="date"
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              className={`w-full ${
                isStepMode
                  ? 'text-base sm:text-lg py-3 px-4 rounded-xl border-2'
                  : 'text-sm py-2.5 px-3.5 rounded-lg border'
              } transition-all focus:outline-none bg-white ${
                error ? 'border-rose-400' : 'border-slate-300'
              }`}
            />
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  /* ── THANK YOU / SUCCESS SCREEN ── */
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-md text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center mx-auto text-white shadow-sm"
            style={{ backgroundColor: brandColor }}
          >
            <CheckCircle size={32} />
          </div>

          <h2 className="text-xl font-extrabold text-slate-900">
            {form.settings.thank_you_title || 'Thank You!'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {form.settings.thank_you_message || 'Your response has been safely recorded.'}
          </p>

          {form.settings.redirect_url && (
            <p className="text-[11px] text-slate-400 pt-2">Redirecting you shortly...</p>
          )}

          {form.settings.show_forma_badge && (
            <div className="pt-6 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <span>⚡ Powered by</span>
              <span className="font-bold text-slate-600">Forma AI</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── MODE 1: ONE-BY-ONE (TYPEFORM STYLE) ── */
  if (form.display_mode === 'one_by_one') {
    const currentField = form.fields[currentStep];
    const progressPct = Math.round(((currentStep + 1) / Math.max(form.fields.length, 1)) * 100);

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900">
        {/* Top Progress Bar */}
        <div className="w-full bg-slate-200 h-1.5">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${progressPct}%`, backgroundColor: brandColor }}
          />
        </div>

        {/* Top Header / Logo */}
        <header className="px-6 py-4 flex items-center justify-between max-w-3xl w-full mx-auto">
          {form.settings.logo_url ? (
            <img src={form.settings.logo_url} alt="Logo" className="h-8 max-w-[140px] object-contain" />
          ) : (
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{form.title}</span>
          )}

          <span className="text-xs font-semibold text-slate-500">
            {currentStep + 1} <span className="text-slate-300">/</span> {form.fields.length}
          </span>
        </header>

        {/* Middle: Active Question Card */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full space-y-6">
            {currentField ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
                <div className="space-y-2">
                  <span
                    className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                  >
                    Question {currentStep + 1}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                    {currentField.label}
                    {currentField.required && <span className="text-rose-500 ml-1">*</span>}
                  </h2>
                  {currentField.help_text && (
                    <p className="text-xs sm:text-sm text-slate-500">{currentField.help_text}</p>
                  )}
                </div>

                {/* Input Component */}
                <div className="pt-2">{renderFieldInput(currentField, true)}</div>

                {/* Step Controls */}
                <div className="flex items-center gap-3 pt-4">
                  {currentStep > 0 && (
                    <button
                      type="button"
                      onClick={handlePrevStep}
                      className="p-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                      title="Previous Question"
                    >
                      <ArrowLeft size={18} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={submitting}
                    className="flex-1 sm:flex-initial px-6 py-3 rounded-xl text-white font-semibold text-sm shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2"
                    style={{ backgroundColor: brandColor }}
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : currentStep === form.fields.length - 1 ? (
                      form.settings.submit_button_text || 'Submit Response'
                    ) : (
                      <>
                        Next <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <span className="hidden sm:inline-block text-[11px] text-slate-400 pl-2">
                    Press <span className="font-semibold text-slate-600">Enter ↵</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500">No questions configured.</div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="p-4 text-center">
          {form.settings.show_forma_badge && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] text-slate-500 shadow-2xs">
              <span>⚡ Powered by</span>
              <span className="font-bold text-slate-700">Forma AI</span>
            </div>
          )}
        </footer>
      </div>
    );
  }

  /* ── MODE 2: CLASSIC SCROLL LAYOUT ── */
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Banner */}
          <div className="p-6 sm:p-8 border-b border-slate-100 space-y-3">
            {form.settings.logo_url && (
              <img src={form.settings.logo_url} alt="Logo" className="h-10 max-w-[180px] object-contain mb-2" />
            )}
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{form.title}</h1>
            {form.description && (
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{form.description}</p>
            )}
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {form.fields.map((field, idx) => (
              <div key={field.id} className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold text-slate-800">
                  {idx + 1}. {field.label}
                  {field.required && <span className="text-rose-500 ml-1">*</span>}
                </label>
                {field.help_text && <p className="text-[11px] text-slate-400">{field.help_text}</p>}

                {renderFieldInput(field, false)}
              </div>
            ))}

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-5 rounded-xl text-white font-bold text-sm shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: brandColor }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Submitting...
                  </>
                ) : (
                  form.settings.submit_button_text || 'Submit Response'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Subtle Forma White-label Badge */}
        {form.settings.show_forma_badge && (
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-[10px] text-slate-500 shadow-2xs">
              <span>⚡ Powered by</span>
              <span className="font-bold text-slate-700">Forma AI</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
