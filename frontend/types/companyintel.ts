export type JobStatus = "pending" | "running" | "completed" | "partial" | "failed" | "cancelled";
export type RecordStatus = "pending" | "success" | "failed" | "skipped";

export interface CompanyIntelRecord {
  id: string;
  job_id: string;
  company_name: string;
  company_url: string;
  summary_business: string | null;
  summary_ir: string | null;
  summary_other: string | null;
  decision_maker: string | null;
  hypothesis: string | null;
  letter_draft: string | null;
  sources: string[];
  doc_url: string | null;
  status: RecordStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyIntelJob {
  id: string;
  name: string;
  status: JobStatus;
  search_config: {
    search_queries: string[];
    limit: number;
    locale: string;
    manual_companies: Array<{ company_name: string; company_url: string }>;
  };
  output_config: {
    mode: "google_sheets" | "csv";
    spreadsheet_id?: string | null;
    worksheet?: string;
    docs_output?: boolean;
    docs_folder_id?: string | null;
    csv_path?: string;
  };
  llm_config: {
    provider: "openai" | "anthropic" | "mock";
    model: string;
    temperature: number;
  };
  crawling_config: {
    max_pages_per_site: number;
    obey_robots: boolean;
    rate_limit_sec: number;
    request_timeout_sec: number;
  };
  total_companies: number;
  processed_companies: number;
  succeeded_companies: number;
  failed_companies: number;
  estimated_cost_usd: number | null;
  error_message: string | null;
  logs: string[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  records: CompanyIntelRecord[];
}

export interface JobListResponse {
  items: CompanyIntelJob[];
  total: number;
}

export interface CreateJobRequest {
  name: string;
  search: {
    search_queries: string[];
    limit: number;
    locale: string;
    manual_companies: Array<{ company_name: string; company_url: string }>;
  };
  output: {
    mode: "google_sheets" | "csv";
    spreadsheet_id?: string;
    worksheet: string;
    docs_output: boolean;
    docs_folder_id?: string;
    csv_path: string;
  };
  llm: {
    provider: "openai" | "anthropic" | "mock";
    model: string;
    temperature: number;
  };
  crawling: {
    max_pages_per_site: number;
    obey_robots: boolean;
    rate_limit_sec: number;
    request_timeout_sec: number;
  };
  run_async: boolean;
}
