"use client";

import { useEffect, useMemo, useState } from "react";

import { createJob, getJob, listJobs, rerunFailed, updateRecord } from "@/lib/api";
import type { CompanyIntelJob, CompanyIntelRecord, CreateJobRequest } from "@/types/companyintel";

function toBooleanString(value: boolean): string {
  return value ? "true" : "false";
}

const initialManualCompanies = "";

export default function Page() {
  const [jobName, setJobName] = useState("CompanyIntel Batch");
  const [searchQueries, setSearchQueries] = useState("渋谷 IT 受託開発\n神奈川 製造 DX 企業");
  const [limit, setLimit] = useState(20);
  const [locale, setLocale] = useState("ja-JP");
  const [manualCompanies, setManualCompanies] = useState(initialManualCompanies);

  const [outputMode, setOutputMode] = useState<"google_sheets" | "csv">("csv");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [worksheet, setWorksheet] = useState("companies");
  const [docsOutput, setDocsOutput] = useState(true);
  const [docsFolderId, setDocsFolderId] = useState("");
  const [csvPath, setCsvPath] = useState("./output/companyintel_output.csv");

  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic" | "mock">("mock");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.2);

  const [maxPagesPerSite, setMaxPagesPerSite] = useState(5);
  const [obeyRobots, setObeyRobots] = useState(true);
  const [rateLimitSec, setRateLimitSec] = useState(2);
  const [requestTimeoutSec, setRequestTimeoutSec] = useState(15);

  const [submitting, setSubmitting] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<CompanyIntelJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<CompanyIntelJob | null>(null);

  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);

  const estimatedCost = useMemo(() => {
    const llmUnit = llmProvider === "mock" ? 0 : 0.018;
    const docsUnit = docsOutput ? 0.002 : 0;
    return (limit * (llmUnit + docsUnit)).toFixed(3);
  }, [docsOutput, limit, llmProvider]);

  const estimatedSearchQuota = useMemo(() => Math.ceil(limit / 10), [limit]);

  async function refreshJobs() {
    try {
      const response = await listJobs({ include_records: "false", limit: 30, offset: 0 });
      setJobs(response.items);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "ジョブ一覧の取得に失敗しました");
    }
  }

  async function refreshSelectedJob(jobId: string) {
    setLoadingJob(true);
    try {
      const job = await getJob(jobId, true);
      setSelectedJob(job);
      setDraftEdits((prev) => {
        const next = { ...prev };
        for (const record of job.records) {
          if (next[record.id] === undefined) {
            next[record.id] = record.letter_draft ?? "";
          }
        }
        return next;
      });
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "ジョブ詳細の取得に失敗しました");
    } finally {
      setLoadingJob(false);
    }
  }

  useEffect(() => {
    void refreshJobs();
  }, []);

  useEffect(() => {
    if (!selectedJob) return;

    const shouldPoll = selectedJob.status === "running" || selectedJob.status === "pending";
    if (!shouldPoll) return;

    const timer = setInterval(() => {
      void refreshSelectedJob(selectedJob.id);
      void refreshJobs();
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedJob]);

  function parseManualCompanies(input: string): Array<{ company_name: string; company_url: string }> {
    return input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [company_name, company_url] = line.split(",").map((part) => part.trim());
        return { company_name, company_url };
      })
      .filter((item) => item.company_name && item.company_url);
  }

  async function handleCreateJob() {
    setSubmitting(true);
    setError(null);

    try {
      const queryList = searchQueries
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const payload: CreateJobRequest = {
        name: jobName,
        search: {
          search_queries: queryList,
          limit,
          locale,
          manual_companies: parseManualCompanies(manualCompanies)
        },
        output: {
          mode: outputMode,
          spreadsheet_id: outputMode === "google_sheets" ? spreadsheetId : undefined,
          worksheet,
          docs_output: docsOutput,
          docs_folder_id: docsFolderId || undefined,
          csv_path: csvPath
        },
        llm: {
          provider: llmProvider,
          model: llmModel,
          temperature
        },
        crawling: {
          max_pages_per_site: maxPagesPerSite,
          obey_robots: obeyRobots,
          rate_limit_sec: rateLimitSec,
          request_timeout_sec: requestTimeoutSec
        },
        run_async: true
      };

      const created = await createJob(payload);
      setSelectedJob(created);
      await refreshJobs();
      await refreshSelectedJob(created.id);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "ジョブ作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRerunFailed(jobId: string) {
    setError(null);
    try {
      await rerunFailed(jobId);
      await refreshSelectedJob(jobId);
      await refreshJobs();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "失敗分再実行に失敗しました");
    }
  }

  async function handleSaveRecord(record: CompanyIntelRecord) {
    if (!selectedJob) return;

    setSavingRecordId(record.id);
    setError(null);
    try {
      await updateRecord(selectedJob.id, record.id, {
        letter_draft: draftEdits[record.id] ?? record.letter_draft ?? ""
      });
      await refreshSelectedJob(selectedJob.id);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "手紙下書きの更新に失敗しました");
    } finally {
      setSavingRecordId(null);
    }
  }

  const progress = selectedJob
    ? Math.round((selectedJob.processed_companies / Math.max(1, selectedJob.total_companies)) * 100)
    : 0;

  return (
    <main className="page-shell">
      <section className="glass-panel">
        <h1>CompanyIntel Letter Builder</h1>
        <p className="subtitle">
          Google検索API・企業サイト情報・IR PDFをもとに、仮説ベースの提案文下書きを生成します。
        </p>

        <div className="grid two">
          <label>
            ジョブ名
            <input value={jobName} onChange={(event) => setJobName(event.target.value)} />
          </label>
          <label>
            locale
            <input value={locale} onChange={(event) => setLocale(event.target.value)} />
          </label>
        </div>

        <label>
          検索クエリ（1行1件）
          <textarea value={searchQueries} onChange={(event) => setSearchQueries(event.target.value)} rows={4} />
        </label>

        <label>
          手動企業入力（company_name,company_url を1行1件）
          <textarea
            value={manualCompanies}
            onChange={(event) => setManualCompanies(event.target.value)}
            rows={3}
            placeholder="株式会社サンプル,https://example.com"
          />
        </label>

        <div className="grid three">
          <label>
            件数上限
            <input type="number" min={1} max={200} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          </label>
          <label>
            LLM Provider
            <select value={llmProvider} onChange={(event) => setLlmProvider(event.target.value as "openai" | "anthropic" | "mock")}>
              <option value="mock">mock</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
            </select>
          </label>
          <label>
            LLM Model
            <input value={llmModel} onChange={(event) => setLlmModel(event.target.value)} />
          </label>
        </div>

        <div className="grid four">
          <label>
            温度
            <input
              type="number"
              step={0.1}
              min={0}
              max={1}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
          </label>
          <label>
            max_pages_per_site
            <input
              type="number"
              min={1}
              max={20}
              value={maxPagesPerSite}
              onChange={(event) => setMaxPagesPerSite(Number(event.target.value))}
            />
          </label>
          <label>
            rate_limit_sec
            <input
              type="number"
              step={0.5}
              min={0}
              max={30}
              value={rateLimitSec}
              onChange={(event) => setRateLimitSec(Number(event.target.value))}
            />
          </label>
          <label>
            timeout_sec
            <input
              type="number"
              min={3}
              max={120}
              value={requestTimeoutSec}
              onChange={(event) => setRequestTimeoutSec(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="switch-row">
          <label className="checkbox-inline">
            <input type="checkbox" checked={obeyRobots} onChange={(event) => setObeyRobots(event.target.checked)} />
            robots.txt を遵守
          </label>
        </div>

        <h2>出力設定</h2>
        <div className="grid two">
          <label>
            mode
            <select value={outputMode} onChange={(event) => setOutputMode(event.target.value as "google_sheets" | "csv")}>
              <option value="csv">csv</option>
              <option value="google_sheets">google_sheets</option>
            </select>
          </label>
          <label>
            worksheet
            <input value={worksheet} onChange={(event) => setWorksheet(event.target.value)} />
          </label>
        </div>

        {outputMode === "google_sheets" && (
          <label>
            spreadsheet_id
            <input value={spreadsheetId} onChange={(event) => setSpreadsheetId(event.target.value)} />
          </label>
        )}

        <div className="grid two">
          <label>
            csv_path
            <input value={csvPath} onChange={(event) => setCsvPath(event.target.value)} />
          </label>
          <label>
            docs_folder_id（任意）
            <input value={docsFolderId} onChange={(event) => setDocsFolderId(event.target.value)} />
          </label>
        </div>

        <div className="switch-row">
          <label className="checkbox-inline">
            <input type="checkbox" checked={docsOutput} onChange={(event) => setDocsOutput(event.target.checked)} />
            Docs 出力を有効化
          </label>
        </div>

        <div className="cost-box">
          <p>想定取得件数: {limit} 社</p>
          <p>推定 Google API クォータ消費: {estimatedSearchQuota} リクエスト</p>
          <p>推定コスト: ${estimatedCost}（概算）</p>
          <p>
            安全ガード: 実行前に出力先・件数を確認してください。`obey_robots={toBooleanString(obeyRobots)}` を維持することを推奨します。
          </p>
        </div>

        <button type="button" disabled={submitting} onClick={() => void handleCreateJob()} className="primary-button">
          {submitting ? "作成中..." : "ジョブ作成・実行"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="glass-panel">
        <h2>ジョブ一覧</h2>
        <div className="job-list">
          {jobs.map((job) => (
            <button key={job.id} type="button" className="job-card" onClick={() => void refreshSelectedJob(job.id)}>
              <span>{job.name}</span>
              <span>{job.status}</span>
              <span>
                {job.processed_companies}/{job.total_companies}
              </span>
            </button>
          ))}
          {jobs.length === 0 && <p>ジョブはまだありません。</p>}
        </div>
      </section>

      <section className="glass-panel">
        <h2>ジョブ詳細</h2>
        {!selectedJob && <p>ジョブを選択してください。</p>}

        {selectedJob && (
          <>
            <div className="job-header">
              <div>
                <p>ID: {selectedJob.id}</p>
                <p>status: {selectedJob.status}</p>
                <p>
                  progress: {selectedJob.processed_companies}/{selectedJob.total_companies} ({progress}%)
                </p>
              </div>
              <div className="button-group">
                <button type="button" onClick={() => void refreshSelectedJob(selectedJob.id)} disabled={loadingJob}>
                  {loadingJob ? "更新中..." : "最新化"}
                </button>
                <button type="button" onClick={() => void handleRerunFailed(selectedJob.id)}>
                  失敗のみ再実行
                </button>
              </div>
            </div>

            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>

            {selectedJob.error_message && <p className="error-text">{selectedJob.error_message}</p>}

            <h3>企業レコード</h3>
            <div className="record-list">
              {selectedJob.records.map((record) => (
                <article key={record.id} className="record-card">
                  <header>
                    <h4>{record.company_name}</h4>
                    <span className={`badge status-${record.status}`}>{record.status}</span>
                  </header>

                  <p>
                    URL: <a href={record.company_url}>{record.company_url}</a>
                  </p>
                  {record.doc_url && (
                    <p>
                      Docs: <a href={record.doc_url}>{record.doc_url}</a>
                    </p>
                  )}

                  <p>{record.summary_business ?? ""}</p>
                  <p>{record.hypothesis ?? ""}</p>

                  {record.error_message && <p className="error-text">{record.error_message}</p>}

                  <label>
                    手紙下書き（編集可）
                    <textarea
                      value={draftEdits[record.id] ?? ""}
                      rows={8}
                      onChange={(event) =>
                        setDraftEdits((prev) => ({
                          ...prev,
                          [record.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSaveRecord(record)}
                    disabled={savingRecordId === record.id}
                  >
                    {savingRecordId === record.id ? "保存中..." : "下書き保存"}
                  </button>
                </article>
              ))}
              {selectedJob.records.length === 0 && <p>レコードはまだありません。</p>}
            </div>

            <h3>ログ</h3>
            <pre className="log-box">{selectedJob.logs.join("\n")}</pre>
          </>
        )}
      </section>
    </main>
  );
}
