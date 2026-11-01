import type { Static } from "typebox";
import type {
  Comparison,
  QuerySpec,
} from "../../../../packages/contracts/src/index";
import type {
  CatalogSchema,
  HistorySchema,
  RunDTO,
  RunEventDTO,
  ReportDTO,
  EvidenceDTO,
  DatasetDTO,
  DatasetProfileDTO,
  OverviewDTO,
  TraceDTO,
  PhaseName,
} from "../../../../packages/contracts/src/http";
export type { Comparison, QuerySpec, PhaseName };
// 页面和 HTTP adapter 直接复用共享 HTTP DTO，不维护另一套报告结构。
export type Dataset = DatasetDTO;
export type DatasetProfile = DatasetProfileDTO;
export type Overview = OverviewDTO;
export type Catalog = Static<typeof CatalogSchema>;
export type Report = ReportDTO;
export type Evidence = EvidenceDTO;
export type Run = RunDTO;
export type RunEvent = RunEventDTO;
export type TraceEntry = TraceDTO;
export type HistoryItem = Static<typeof HistorySchema>[number];
export interface StartInput {
  question: string;
  parentRunId?: string;
  confirmedIntent?: QuerySpec;
}
export interface AnalysisApi {
  catalog(): Promise<Catalog>;
  profile(datasetVersion: string, signal?: AbortSignal): Promise<DatasetProfile>;
  overview(datasetVersion: string, query: QuerySpec, signal?: AbortSignal): Promise<Overview>;
  history(): Promise<HistoryItem[]>;
  createSession(datasetVersion?: string): Promise<string>;
  start(sessionId: string, input: StartInput): Promise<Run>;
  subscribe(
    runId: string,
    after: number,
    event: (event: RunEvent) => void,
    connection: (connected: boolean, message?: string) => void,
    snapshot: (run: Run) => void,
  ): () => void;
  run(runId: string): Promise<Run>;
  report(id: string): Promise<Report>;
  evidence(id: string): Promise<Evidence>;
  cancel(runId: string): Promise<Run>;
  export(id: string, format: "md" | "json"): Promise<Blob>;
}
