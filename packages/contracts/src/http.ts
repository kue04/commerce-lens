import { Type, type Static } from 'typebox';
import { QuerySpecSchema,MetricIdSchema } from './index.js';

const object=<T extends Record<string, import('typebox').TSchema>>(properties:T)=>Type.Object(properties,{additionalProperties:false});
const text=()=>Type.String({minLength:1});
const instant=()=>Type.String({pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$'});
const optionalText=()=>Type.Optional(text());
const nullableNumber=()=>Type.Union([Type.Number(),Type.Null()]);
const integer=()=>Type.Integer({minimum:-Number.MAX_SAFE_INTEGER,maximum:Number.MAX_SAFE_INTEGER});
const nullableInteger=()=>Type.Union([integer(),Type.Null()]);
export const CONTRACT_VERSION='1.0.0';
export const ExecutionModeSchema=Type.Union([Type.Literal('deterministic'),Type.Literal('agent')]);
export const RunStatusSchema=Type.Union([Type.Literal('queued'),Type.Literal('running'),Type.Literal('completed'),Type.Literal('partial'),Type.Literal('needs_clarification'),Type.Literal('insufficient_data'),Type.Literal('failed'),Type.Literal('cancelled'),Type.Literal('timed_out'),Type.Literal('interrupted')]);
export const PhaseNameSchema=Type.Union([Type.Literal('received'),Type.Literal('interpreting'),Type.Literal('checking_data'),Type.Literal('comparing'),Type.Literal('decomposing'),Type.Literal('inspecting'),Type.Literal('validating'),Type.Literal('persisting')]);
export type PhaseName=Static<typeof PhaseNameSchema>;
export type RunStatus=Static<typeof RunStatusSchema>;
export type ExecutionMode=Static<typeof ExecutionModeSchema>;
export const UsageSchema=object({modelRequests:Type.Integer({minimum:0}),toolCalls:Type.Integer({minimum:0}),tokens:Type.Integer({minimum:0}),costUsd:Type.Union([Type.Number({minimum:0}),Type.Null()])});
export const ComparisonSchema=object({current:nullableNumber(),baseline:nullableNumber(),delta:nullableNumber(),changeRate:nullableNumber()});
export const ContributorSchema=object({key:text(),label:text(),isOther:Type.Boolean(),current:nullableInteger(),baseline:nullableInteger(),delta:nullableInteger(),changeRate:nullableNumber(),share:nullableNumber()});
export const DatasetSchema=object({version:text(),storeName:text(),synthetic:Type.Literal(true),businessClock:Type.String(),updatedAt:instant(),timezone:Type.Literal('Asia/Shanghai')});
export const CatalogSchema=object({
  ...DatasetSchema.properties,contractVersion:Type.Literal(CONTRACT_VERSION),executionMode:ExecutionModeSchema,
  supportedMetrics:Type.Array(MetricIdSchema),datasets:Type.Array(DatasetSchema),
});
export const AnalysisRequestSchema=object({question:Type.String({minLength:1,maxLength:2000}),confirmedIntent:Type.Optional(QuerySpecSchema),parentRunId:optionalText()});
export const SessionRequestSchema=object({datasetVersion:Type.Optional(text())});
export const SessionResponseSchema=object({sessionId:text(),datasetVersion:text()});
export const StartRunResponseSchema=object({runId:text(),status:RunStatusSchema,eventsUrl:text()});
export const ClarificationSchema=object({question:text(),metricId:Type.Literal('paid_amount'),date:Type.String(),region:text()});
export const RunSchema=object({
  id:text(),sessionId:text(),question:text(),status:RunStatusSchema,
  phase:Type.Integer({minimum:0,maximum:7}),phaseName:PhaseNameSchema,executionMode:ExecutionModeSchema,
  createdAt:instant(),endedAt:Type.Optional(instant()),reportId:optionalText(),parentRunId:optionalText(),
  clarification:Type.Optional(ClarificationSchema),message:optionalText(),usage:UsageSchema,
});
export const EvidenceSchema=object({
  id:text(),runId:text(),code:text(),title:text(),kind:Type.Union([Type.Literal('comparison'),Type.Literal('contribution'),Type.Literal('inventory'),Type.Literal('quality'),Type.Literal('traffic'),Type.Literal('promotion'),Type.Literal('refund_reason')]),
  status:Type.Union([Type.Literal('success'),Type.Literal('missing')]),metricId:MetricIdSchema,query:QuerySpecSchema,
  source:text(),datasetVersion:text(),metricVersion:text(),createdAt:instant(),coverage:nullableNumber(),baselineCoverage:nullableNumber(),
  columns:Type.Array(Type.String()),rows:Type.Array(Type.Array(Type.Union([Type.String(),Type.Number(),Type.Null()]))),note:text(),
  resultHash:text(),queryTemplateIds:Type.Array(text()),comparison:Type.Optional(ComparisonSchema),contributors:Type.Optional(Type.Array(ContributorSchema)),
});
export const FactSchema=object({text:text(),templateId:Type.Union([Type.Literal('comparison'),Type.Literal('contribution')]),evidenceIds:Type.Array(text(),{minItems:1}),valueRefs:Type.Array(text(),{minItems:1})});
export const HypothesisSchema=object({text:text(),evidenceIds:Type.Array(text(),{minItems:1}),missingEvidence:Type.Array(text())});
export const TraceSchema=object({name:text(),params:Type.String(),status:Type.Union([Type.Literal('success'),Type.Literal('missing')]),durationMs:Type.Number({minimum:0}),evidenceId:optionalText()});
export const ReportSchema=object({
  id:text(),runId:text(),sessionId:text(),question:text(),title:text(),status:Type.Union([Type.Literal('completed'),Type.Literal('partial')]),
  query:QuerySpecSchema,scopeLabel:text(),metricLabel:text(),unit:Type.Literal('fen'),dataset:DatasetSchema,
  comparison:ComparisonSchema,contributors:Type.Array(ContributorSchema),finding:text(),facts:Type.Array(FactSchema),hypotheses:Type.Array(HypothesisSchema),
  unknowns:Type.Array(text()),nextActions:Type.Array(text()),limitations:Type.Array(text()),evidences:Type.Array(EvidenceSchema),trace:Type.Array(TraceSchema),createdAt:instant(),
  provenance:object({contractVersion:Type.Literal(CONTRACT_VERSION),executionMode:ExecutionModeSchema,agentExecuted:Type.Boolean(),modelId:Type.Union([text(),Type.Null()]),promptVersion:text(),metricVersion:text(),datasetVersion:text()}),
});
export const HistorySchema=Type.Array(object({sessionId:text(),reportId:text(),title:text(),createdAt:instant(),question:text()}));
export const ErrorSchema=object({code:text(),message:text(),retryable:Type.Boolean(),traceId:text(),details:Type.Optional(object({field:Type.Optional(Type.String())}))});

const event=<T extends string,P extends import('typebox').TSchema>(type:T,payload:P)=>object({runId:text(),seq:Type.Integer({minimum:1}),type:Type.Literal(type),at:instant(),payload});
export const RunEventSchema=Type.Union([
  event('run.started',object({status:Type.Literal('running'),executionMode:ExecutionModeSchema})),
  event('phase.changed',object({phase:Type.Integer({minimum:0,maximum:7}),phaseName:PhaseNameSchema,action:text()})),
  event('tool.started',object({toolCallId:text(),toolName:text(),params:Type.String()})),
  event('tool.completed',object({toolCallId:text(),toolName:text(),durationMs:Type.Number({minimum:0}),rowCount:Type.Integer({minimum:0}),evidenceId:optionalText()})),
  event('tool.failed',object({toolCallId:text(),toolName:text(),code:text(),retryable:Type.Boolean()})),
  event('clarification.required',object({status:Type.Literal('needs_clarification'),clarification:ClarificationSchema})),
  event('report.ready',object({reportId:text(),status:Type.Union([Type.Literal('completed'),Type.Literal('partial')])})),
  event('run.finished',object({status:RunStatusSchema,message:optionalText(),usage:UsageSchema,reason:text()})),
]);
export type AnalysisRequest=Static<typeof AnalysisRequestSchema>;
export type RunDTO=Static<typeof RunSchema>;
export type EvidenceDTO=Static<typeof EvidenceSchema>;
export type ReportDTO=Static<typeof ReportSchema>;
export type DatasetDTO=Static<typeof DatasetSchema>;
export type RunEventDTO=Static<typeof RunEventSchema>;
export type TraceDTO=Static<typeof TraceSchema>;

// Model selects registered evidence IDs only. All facts/values/text are rendered by code.
export const ReportDraftSchema=object({comparisonEvidenceId:text(),contributionEvidenceId:optionalText()});
export type ReportDraft=Static<typeof ReportDraftSchema>;
