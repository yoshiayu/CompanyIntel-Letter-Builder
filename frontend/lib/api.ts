import type {
  CompanyIntelJob,
  CompanyIntelRecord,
  CreateJobRequest,
  JobListResponse
} from "@/types/companyintel";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export async function listJobs(params?: {
  status?: string;
  has_failures?: string;
  include_records?: string;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.has_failures) query.set("has_failures", params.has_failures);
  if (params?.include_records) query.set("include_records", params.include_records);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<JobListResponse>(`/api/companyintel-letter-builder${suffix}`);
}

export async function createJob(payload: CreateJobRequest): Promise<CompanyIntelJob> {
  return request<CompanyIntelJob>("/api/companyintel-letter-builder", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getJob(jobId: string, includeRecords = true): Promise<CompanyIntelJob> {
  return request<CompanyIntelJob>(
    `/api/companyintel-letter-builder/${jobId}?include_records=${includeRecords ? "true" : "false"}`
  );
}

export async function rerunFailed(jobId: string): Promise<CompanyIntelJob> {
  return request<CompanyIntelJob>(`/api/companyintel-letter-builder/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ rerun_failed_only: true })
  });
}

export async function updateRecord(
  jobId: string,
  recordId: string,
  payload: Partial<Pick<CompanyIntelRecord, "letter_draft" | "hypothesis" | "decision_maker">>
): Promise<CompanyIntelRecord> {
  return request<CompanyIntelRecord>(`/api/companyintel-letter-builder/${jobId}/records/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
