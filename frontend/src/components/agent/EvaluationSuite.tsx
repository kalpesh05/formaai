import { useState, useEffect, FormEvent } from 'react';
import { apiRequest } from '../../services/api';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Play, 
  FileSpreadsheet, Loader, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface EvaluationItemResult {
  id: string;
  question: string;
  category: string;
  expected_answer?: string;
  generated_answer: string;
  retrieved_chunks: Array<{ content: string; similarity: number }>;
  top_similarity: number;
  faithfulness_score: number;
  status: 'pass' | 'low_confidence' | 'hallucination_risk' | 'fail';
  reason: string;
  latency_ms: number;
}

interface EvaluationRunSummary {
  id: string;
  agent_id: string;
  dataset_name: string;
  total_tests: number;
  passed_tests: number;
  accuracy_rate: number;
  avg_similarity: number;
  hallucination_count: number;
  low_confidence_count: number;
  results: EvaluationItemResult[];
  created_at: string;
}

interface EvaluationSuiteProps {
  agentId: string;
}

export default function EvaluationSuite({ agentId }: EvaluationSuiteProps) {
  const [runs, setRuns] = useState<any[]>([]);
  const [currentRun, setCurrentRun] = useState<EvaluationRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'low_confidence' | 'hallucination_risk' | 'fail'>('all');
  const [customCsvFile, setCustomCsvFile] = useState<File | null>(null);

  // Fetch past runs on mount
  useEffect(() => {
    loadPastRuns();
  }, [agentId]);

  const loadPastRuns = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const pastRuns = await apiRequest(`/agents/${agentId}/evaluations`, 'GET');
      setRuns(pastRuns || []);
      if (pastRuns && pastRuns.length > 0) {
        // Load the latest run full details
        const latestRun = await apiRequest(`/agents/${agentId}/evaluations/${pastRuns[0].id}`, 'GET');
        setCurrentRun(latestRun);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load evaluation history');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRun = async (runId: string) => {
    setLoading(true);
    try {
      const selected = await apiRequest(`/agents/${agentId}/evaluations/${runId}`, 'GET');
      setCurrentRun(selected);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch evaluation details');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAutoBenchmark = async () => {
    setEvaluating(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const result = await apiRequest(`/agents/${agentId}/evaluate`, 'POST', {
        dataset_name: `Synthetic Benchmark (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        auto_generate: true,
        count: 10
      });
      setCurrentRun(result);
      setSuccessMsg(`Evaluation benchmark completed with ${result.accuracy_rate}% accuracy score!`);
      loadPastRuns();
    } catch (err: any) {
      setErrorMsg(err.message || 'Evaluation run failed');
    } finally {
      setEvaluating(false);
    }
  };

  const parseCsvToTestCases = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
    const qIdx = headers.findIndex(h => h.includes('question') || h.includes('query') || h.includes('prompt'));
    const aIdx = headers.findIndex(h => h.includes('answer') || h.includes('expected') || h.includes('resolution'));
    const cIdx = headers.findIndex(h => h.includes('category') || h.includes('type') || h.includes('tag'));

    const parsedCases: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic comma split handling
      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      const question = qIdx !== -1 ? cols[qIdx] : cols[0];
      const expected_answer = aIdx !== -1 ? cols[aIdx] : (cols[1] || undefined);
      const category = cIdx !== -1 ? cols[cIdx] : 'Custom Upload';

      if (question && question.length > 3) {
        parsedCases.push({
          id: `custom-${i}`,
          question,
          expected_answer,
          category
        });
      }
    }
    return parsedCases;
  };

  const handleUploadCustomSuite = async (e: FormEvent) => {
    e.preventDefault();
    if (!customCsvFile) return;

    setEvaluating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const fileText = await customCsvFile.text();
      let testCases = [];

      if (customCsvFile.name.endsWith('.json')) {
        testCases = JSON.parse(fileText);
      } else {
        testCases = parseCsvToTestCases(fileText);
      }

      if (!testCases || testCases.length === 0) {
        throw new Error('No valid test cases found in file. Ensure CSV has "question" column.');
      }

      const result = await apiRequest(`/agents/${agentId}/evaluate`, 'POST', {
        dataset_name: customCsvFile.name,
        test_cases: testCases
      });

      setCurrentRun(result);
      setCustomCsvFile(null);
      setSuccessMsg(`Benchmarked ${testCases.length} custom test cases with ${result.accuracy_rate}% accuracy!`);
      loadPastRuns();
    } catch (err: any) {
      setErrorMsg(err.message || 'Custom evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const filteredResults = (currentRun?.results || []).filter(item => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header card with actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-brand-600" size={22} />
              <h2 className="text-lg font-bold text-slate-900">Zero-Blunder Evaluation Suite</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Stress-test your chatbot against legacy business formulas, database schemas, and edge-case customer queries before opening to live traffic. Prevents hallucinations and guarantees strict grounding.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleRunAutoBenchmark}
              loading={evaluating}
              variant="primary"
              size="sm"
              icon={<Sparkles size={14} />}
              className="bg-brand-600 hover:bg-brand-700"
            >
              Run Auto Benchmark (10 Tests)
            </Button>
          </div>
        </div>

        {/* Custom Upload Drop Area */}
        <form onSubmit={handleUploadCustomSuite} className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
            <FileSpreadsheet size={15} className="text-slate-500" />
            <span>{customCsvFile ? customCsvFile.name : 'Upload Custom Benchmark (.CSV / .JSON)'}</span>
            <input
              type="file"
              accept=".csv,.json"
              onChange={(e) => setCustomCsvFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          {customCsvFile && (
            <Button
              type="submit"
              loading={evaluating}
              variant="secondary"
              size="sm"
              icon={<Play size={13} />}
            >
              Run Uploaded Suite
            </Button>
          )}

          {runs.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <span>Benchmark History:</span>
              <select
                value={currentRun?.id || ''}
                onChange={(e) => handleSelectRun(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs bg-white text-slate-800"
              >
                {runs.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.dataset_name} ({r.accuracy_rate}% pass - {new Date(r.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      </div>

      {errorMsg && <Alert type="error">{errorMsg}</Alert>}
      {successMsg && <Alert type="success">{successMsg}</Alert>}

      {/* Evaluating state banner */}
      {evaluating && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-6 text-center space-y-2 animate-pulse">
          <Loader className="animate-spin mx-auto text-brand-600" size={24} />
          <div className="font-semibold text-brand-900 text-sm">Evaluating Knowledge Base Grounding...</div>
          <p className="text-xs text-brand-700">
            Running vector cosine similarity searches, evaluating AST context adherence, and checking for hallucination risks.
          </p>
        </div>
      )}

      {/* Summary Scorecard */}
      {currentRun && !evaluating && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-slate-400 text-xs font-medium">Verified Accuracy</div>
            <div className={`text-2xl font-black mt-1 ${currentRun.accuracy_rate >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {currentRun.accuracy_rate}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Grounding pass rate</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-slate-400 text-xs font-medium">Tests Evaluated</div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {currentRun.total_tests}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{currentRun.passed_tests} verified matches</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-slate-400 text-xs font-medium">Avg Vector Cosine</div>
            <div className="text-2xl font-black text-brand-600 mt-1">
              {(Number(currentRun.avg_similarity) * 100).toFixed(0)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">RAG retrieval relevance</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-slate-400 text-xs font-medium">Low-Conf Guardrails</div>
            <div className="text-2xl font-black text-amber-600 mt-1">
              {currentRun.low_confidence_count}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Safely escalated / refused</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-slate-400 text-xs font-medium">Hallucination Flags</div>
            <div className={`text-2xl font-black mt-1 ${currentRun.hallucination_count === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {currentRun.hallucination_count}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{currentRun.hallucination_count === 0 ? 'Zero blunders' : 'Needs review'}</div>
          </div>
        </div>
      )}

      {/* Detailed itemized breakdown table */}
      {currentRun && !evaluating && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Itemized Test Verification Results</h3>
            <div className="flex gap-1.5 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All ({currentRun.results.length})
              </button>
              <button
                onClick={() => setStatusFilter('pass')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'pass' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Passed ({currentRun.results.filter(r => r.status === 'pass').length})
              </button>
              <button
                onClick={() => setStatusFilter('low_confidence')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'low_confidence' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Low Confidence ({currentRun.results.filter(r => r.status === 'low_confidence').length})
              </button>
              <button
                onClick={() => setStatusFilter('hallucination_risk')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'hallucination_risk' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Hallucinations ({currentRun.results.filter(r => r.status === 'hallucination_risk').length})
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="divide-y divide-slate-100">
            {filteredResults.map((item) => {
              const isExpanded = expandedItemId === item.id;
              return (
                <div key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                  <div 
                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                    className="flex items-start justify-between cursor-pointer gap-4"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.category}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">{item.question}</span>
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1">
                        {item.reason}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-slate-700">
                          {(item.top_similarity * 100).toFixed(0)}% sim
                        </div>
                        <div className="text-[10px] text-slate-400">{item.latency_ms}ms</div>
                      </div>

                      {item.status === 'pass' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                          <CheckCircle2 size={13} /> Pass
                        </span>
                      )}
                      {item.status === 'low_confidence' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                          <AlertTriangle size={13} /> Safeguarded
                        </span>
                      )}
                      {item.status === 'hallucination_risk' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">
                          <XCircle size={13} /> Hallucination
                        </span>
                      )}
                      {item.status === 'fail' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">
                          <XCircle size={13} /> Mismatch
                        </span>
                      )}

                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
                      <div className="space-y-3">
                        <div>
                          <div className="font-bold text-slate-700 mb-1">AI Output Generated:</div>
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 whitespace-pre-wrap font-sans">
                            {item.generated_answer || '(Empty response)'}
                          </div>
                        </div>

                        {item.expected_answer && (
                          <div>
                            <div className="font-bold text-slate-700 mb-1">Expected Ground Truth:</div>
                            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg text-emerald-900 whitespace-pre-wrap font-sans">
                              {item.expected_answer}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-bold text-slate-700 mb-1">Retrieved Knowledge Context (Top Chunks):</div>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {item.retrieved_chunks.length > 0 ? (
                            item.retrieved_chunks.map((chunk, cIdx) => (
                              <div key={cIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
                                <div className="flex justify-between font-mono text-[10px] text-brand-600 font-semibold mb-1">
                                  <span>Chunk #{cIdx + 1}</span>
                                  <span>Similarity: {(chunk.similarity * 100).toFixed(1)}%</span>
                                </div>
                                <div className="line-clamp-4 font-mono">{chunk.content}</div>
                              </div>
                            ))
                          ) : (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 italic">
                              No vector chunks matched above similarity floor.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!currentRun && !evaluating && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-lg mx-auto space-y-4">
          <ShieldCheck size={40} className="mx-auto text-brand-500" />
          <div>
            <h3 className="text-base font-bold text-slate-800">No Offline Benchmark Run Yet</h3>
            <p className="text-xs text-slate-500 mt-1">
              Before rolling out your agent to end-users, run a synthetic benchmark or upload a historical question/answer dataset to ensure 0% hallucination risk.
            </p>
          </div>
          <Button
            onClick={handleRunAutoBenchmark}
            variant="primary"
            size="md"
            icon={<Sparkles size={16} />}
            className="bg-brand-600 hover:bg-brand-700"
          >
            Auto-Generate First Benchmark
          </Button>
        </div>
      )}
    </div>
  );
}
