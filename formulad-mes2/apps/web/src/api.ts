export type ProductionPlanItem = {
  vin: string;
  id: number;
  seqn: number | null;
  modelArticle: string | null;
  modelName: string | null;
  engineNumber: string | null;
  chassisNumber?: string | null;
  color: string | null;
  specificationName: string | null;
  status: string | null;
  statusId: number | null;
  printDate: string | null;
  plannedStartDate: string | null;
  plannedCompleteDate: string | null;
  plannedShipmentDate: string | null;
  startDate: string | null;
  completeDate: string | null;
  fokDate: string | null;
  openNcpCount?: number;
};

export type NcpItem = {
  id: number;
  number: string;
  vin: string;
  station: string;
  componentCode: string;
  componentName: string;
  quantity: number;
  type: string;
  operatorComment: string | null;
  engineerComment: string | null;
  status: string;
  partInstalled: boolean;
  createdAt: string;
  createdBy: string;
  closedAt: string | null;
  closedBy: string | null;
  /** Из плана по VIN (подтягивает GET /ncp). */
  modelArticle?: string | null;
  modelName?: string | null;
  color?: string | null;
};

export type ComponentItem = { code: string; name: string; station: string | null; modelIds?: string[] | null };

export type ModelRef = { article: string; name: string };
/** Пост контроля качества на линии: стоит после станции `afterStation` (по карте контроля). */
export type ControlPost = { name: string; afterStation: string };
export type CalendarSettings = { workdays: number[]; shiftStart: string; shiftEnd: string; breaks: { from: string; to: string }[]; perShift: number; controlPosts?: ControlPost[] };
/** Отметка по дате: off — выходной/праздник; work — рабочий день (в т. ч. перенесённый), возможно с особыми часами. */
export type CalendarDay = { date: string; kind: 'off' | 'work'; from: string | null; to: string | null; note: string | null };
export type CalendarState = { settings: CalendarSettings; days: CalendarDay[] };
/** kind = null — вернуть дату к стандартному графику. */
export type CalendarDayChange = { date: string; kind: 'off' | 'work' | null; from?: string | null; to?: string | null; note?: string | null };

export type EventLogEntry = { id: number; entityType: string; entityKey: string; action: string; oldValue: string | null; newValue: string | null; userName: string; occurredAt: string };

export type PlanReference = { models: ModelRef[]; colors: string[]; specifications: string[] };

export type ImportRawRow = {
  vin: string | null;
  modelArticle: string | null;
  engineNumber: string | null;
  color: string | null;
  specificationName: string | null;
  plannedStartDate: string | null;
  plannedCompleteDate: string | null;
  plannedShipmentDate: string | null;
};

export type ImportRowResult = { rowNumber: number; row: ImportRawRow; errors: string[] };
export type ImportSession = {
  id: string;
  createdAt: string;
  createdBy: string;
  source: string;
  rows: ImportRowResult[];
  totalCount: number;
  errorCount: number;
  acceptedCount: number;
};

export type ComponentCheck = { componentCode: string; checked: boolean; checkedBy: string | null; checkedAt: string | null };

export type SupplierRef = { code: string; name: string; isParentPlant: boolean };

export type PackingListRawRow = {
  packageNumber: string | null;
  article: string | null;
  componentName: string | null;
  quantity: string | null;
  netWeight: string | null;
  grossWeight: string | null;
  batch: string | null;
};

export type PackingListRowResult = {
  rowNumber: number;
  row: PackingListRawRow;
  errors: string[];
  previewRequiredQuantity: number | null;
};

export type PackingListSession = {
  id: string;
  deliveryId: string;
  createdAt: string;
  createdBy: string;
  rows: PackingListRowResult[];
  totalCount: number;
  errorCount: number;
};

export type PackingListRow = {
  id: number;
  componentCode: string;
  componentName: string;
  plannedQuantity: number;
  netWeight: number | null;
  grossWeight: number | null;
  batch: string | null;
  requiredQuantity: number;
  okQuantity: number;
  defectQuantity: number;
  mismatchQuantity: number;
  shortageQuantity: number;
  discrepancyReason: string | null;
  checkedQuantity: number;
  isComplete: boolean;
  hasIssues: boolean;
};

export type DeliveryPackage = {
  id: number;
  deliveryId: string;
  huNumber: string;
  status: 'Open' | 'Closed';
  closedAt: string | null;
  closedBy: string | null;
  rows: PackingListRow[];
  isComplete: boolean;
  hasIssues: boolean;
};

export type Delivery = {
  id: string;
  supplierCode: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  accompanyingDocument: string | null;
  createdAt: string;
  createdBy: string;
  packages: DeliveryPackage[];
  status: 'Open' | 'Verified' | 'VerifiedWithIssues';
};

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

export type QcPost = { id: number; name: string; afterStation: string | null; sortOrder: number; todayComplete: boolean };
export type ChecklistItem = { id: number; postId: number; seq: number; description: string; barcodeHint: string | null };
export type QcResultItem = { id: number; itemId: number; seq: number; description: string; status: string; comment: string | null; checkedBy: string | null; checkedAt: string | null };
export type QcSession = { id: number; postId: number; postName: string; vin: string; startedBy: string; startedAt: string; finishedAt: string | null; outcome: string | null; results: QcResultItem[] };
export type QcSessionSummary = { id: number; postId: number; postName: string; vin: string; startedBy: string; startedAt: string; finishedAt: string | null; outcome: string | null };
export type PrintTemplateItem = { id: number; name: string; bodyHtml: string; updatedAt: string };
export type StationCount = { station: string; count: number };
export type TypeCount = { type: string; count: number };

/** Ошибка API с кодом — UI различает 401 (нет доступа) и 404 (не найдено). */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly detail?: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');
  }
  if (!response.ok) {
    const detail = await response.json().then((p: { detail?: unknown }) => (typeof p?.detail === 'string' ? p.detail : undefined)).catch(() => undefined);
    throw new ApiError(response.status, `Ошибка запроса (${response.status})`, detail);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  me: () => request<{ userName: string | null; mode: string; demo: boolean }>('/api/v1/auth/me'),

  login: (username: string, password: string) =>
    request<{ userName: string }>('/api/v1/dev-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

  events: (params: { entityType?: string; entityKey?: string; limit: number }) => {
    const query = new URLSearchParams({ limit: String(params.limit) });
    if (params.entityType) query.set('entityType', params.entityType);
    if (params.entityKey) query.set('entityKey', params.entityKey);
    return request<EventLogEntry[]>(`/api/v1/events?${query}`);
  },
  calendar: () => request<CalendarState>('/api/v1/calendar'),
  calendarSettings: (settings: CalendarSettings) =>
    request<CalendarState>('/api/v1/calendar/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  calendarApply: (changes: CalendarDayChange[]) =>
    request<CalendarState>('/api/v1/calendar/days', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    }),

  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),

  statuses: () => request<(string | null)[]>('/api/v1/production-plan/statuses'),

  plan: (params: { vin?: string; status?: string | null; statusId?: number; page: number; pageSize: number }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.vin) query.set('vin', params.vin);
    if (params.status !== undefined && params.status !== null) query.set('status', params.status);
    if (params.statusId !== undefined) query.set('statusId', String(params.statusId));
    return request<Paged<ProductionPlanItem>>(`/api/v1/production-plan?${query}`);
  },

  move: (vin: string, toPosition: number) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toPosition }),
    }),

  byVin: (vin: string) => request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}`),

  print: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/print`, { method: 'POST' }),

  start: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/start`, { method: 'POST' }),

  complete: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/complete`, { method: 'POST' }),

  fok: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/fok`, { method: 'POST' }),

  sendToRework: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/rework`, { method: 'POST' }),

  finishRework: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/rework/finish`, { method: 'POST' }),

  planImportReference: () => request<PlanReference>('/api/v1/plan-import/reference'),

  stageImport: (rows: ImportRawRow[], source: string) =>
    request<ImportSession>('/api/v1/plan-import/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, source }),
    }),

  replaceImportRow: (sessionId: string, rowNumber: number, row: ImportRawRow) =>
    request<ImportSession>(`/api/v1/plan-import/sessions/${encodeURIComponent(sessionId)}/rows/${rowNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    }),

  publishImport: (sessionId: string) =>
    request<{ published: number }>(`/api/v1/plan-import/sessions/${encodeURIComponent(sessionId)}/publish`, {
      method: 'POST',
    }),

  ncpTypes: () => request<string[]>('/api/v1/ncp/types'),
  ncpStations: () => request<string[]>('/api/v1/ncp/stations'),
  ncpComponents: () => request<ComponentItem[]>('/api/v1/ncp/components'),

  adminUpdateComponent: (code: string, station: string | null, modelIds: string[] | null) =>
    request<void>(`/api/v1/admin/components/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify({ station, modelIds }),
    }),

  adminAddSupplier: (supplier: SupplierRef) =>
    request<void>('/api/v1/admin/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplier),
    }),

  adminDeleteSupplier: (code: string) =>
    request<void>(`/api/v1/admin/suppliers/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  ncpMissingParts: (vin: string) => request<NcpItem[]>(`/api/v1/ncp/missing-parts?vin=${encodeURIComponent(vin)}`),

  ncpList: (params: { vin?: string; status?: string | null; type?: string | null; station?: string | null; page: number; pageSize: number }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.vin) query.set('vin', params.vin);
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.station) query.set('station', params.station);
    return request<Paged<NcpItem>>(`/api/v1/ncp?${query}`);
  },

  ncpCreate: (data: {
    vin: string;
    station: string;
    componentCode: string;
    quantity: number;
    type: string;
    operatorComment: string | null;
  }) =>
    request<NcpItem>('/api/v1/ncp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  stationChecks: (vin: string) => request<Record<string, ComponentCheck>>(`/api/v1/stations/${encodeURIComponent(vin)}/checks`),

  setStationCheck: (vin: string, componentCode: string, checked: boolean) =>
    request<ComponentCheck>(`/api/v1/stations/${encodeURIComponent(vin)}/components/${encodeURIComponent(componentCode)}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked }),
    }),

  ncpSetPartInstalled: (id: number, installed: boolean) =>
    request<NcpItem>(`/api/v1/ncp/${id}/part-installed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installed }),
    }),

  ncpClose: (id: number, engineerComment: string | null) =>
    request<NcpItem>(`/api/v1/ncp/${id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engineerComment }),
    }),

  suppliers: () => request<SupplierRef[]>('/api/v1/incoming-inspection/suppliers'),

  incomingComponents: () => request<ComponentItem[]>('/api/v1/incoming-inspection/components'),

  addComponent: (code: string, name: string) =>
    request<void>('/api/v1/incoming-inspection/components', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    }),

  deliveries: (page = 1, pageSize = 25) =>
    request<Paged<Delivery>>(`/api/v1/incoming-inspection/deliveries?page=${page}&pageSize=${pageSize}`),

  delivery: (id: string) => request<Delivery>(`/api/v1/incoming-inspection/deliveries/${encodeURIComponent(id)}`),

  createDelivery: (supplierCode: string, invoiceNumber: string, invoiceDate: string, accompanyingDocument: string | null) =>
    request<Delivery>('/api/v1/incoming-inspection/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierCode, invoiceNumber, invoiceDate, accompanyingDocument }),
    }),

  deleteDelivery: (id: string) =>
    request<void>(`/api/v1/incoming-inspection/deliveries/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  packageByHu: (deliveryId: string, hu: string) =>
    request<DeliveryPackage>(`/api/v1/incoming-inspection/deliveries/${encodeURIComponent(deliveryId)}/packages/by-hu/${encodeURIComponent(hu)}`),

  stagePackingList: (deliveryId: string, rows: PackingListRawRow[]) =>
    request<PackingListSession>(`/api/v1/incoming-inspection/deliveries/${encodeURIComponent(deliveryId)}/packing-list/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),

  replacePackingListRow: (sessionId: string, rowNumber: number, row: PackingListRawRow) =>
    request<PackingListSession>(`/api/v1/incoming-inspection/packing-list/sessions/${encodeURIComponent(sessionId)}/rows/${rowNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    }),

  confirmPackingList: (sessionId: string) =>
    request<Delivery>(`/api/v1/incoming-inspection/packing-list/sessions/${encodeURIComponent(sessionId)}/confirm`, { method: 'POST' }),

  recordRowResult: (packageId: number, rowId: number, outcome: string, quantity: number, reason: string | null) =>
    request<DeliveryPackage>(`/api/v1/incoming-inspection/packages/${packageId}/rows/${rowId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, quantity, reason }),
    }),

  increaseQuota: (packageId: number, rowId: number, newRequiredQuantity: number, comment: string) =>
    request<DeliveryPackage>(`/api/v1/incoming-inspection/packages/${packageId}/rows/${rowId}/quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRequiredQuantity, comment }),
    }),

  closePackage: (packageId: number) =>
    request<DeliveryPackage>(`/api/v1/incoming-inspection/packages/${packageId}/close`, { method: 'POST' }),

  reopenPackage: (packageId: number, comment: string) =>
    request<DeliveryPackage>(`/api/v1/incoming-inspection/packages/${packageId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    }),

  qcPosts: (vin?: string) => request<QcPost[]>(vin ? `/api/v1/qc/posts?vin=${encodeURIComponent(vin)}` : '/api/v1/qc/posts'),
  qcPostSessions: (postId: number, limit = 20) =>
    request<QcSessionSummary[]>(`/api/v1/qc/posts/${postId}/sessions?limit=${limit}`),

  qcItems: (postId: number) => request<ChecklistItem[]>(`/api/v1/qc/posts/${postId}/items`),

  qcStartSession: (postId: number, vin: string) =>
    request<QcSession>('/api/v1/qc/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, vin }),
    }),

  qcGetSession: (id: number) => request<QcSession>(`/api/v1/qc/sessions/${id}`),

  qcRecordResult: (sessionId: number, itemId: number, status: string, comment: string | null) =>
    request<QcResultItem>(`/api/v1/qc/sessions/${sessionId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, status, comment }),
    }),

  qcFinishSession: (sessionId: number, outcome: string) =>
    request<QcSession>(`/api/v1/qc/sessions/${sessionId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    }),

  printTemplates: () => request<PrintTemplateItem[]>('/api/v1/admin/print-templates'),
  printTemplate: (id: number) => request<PrintTemplateItem>(`/api/v1/admin/print-templates/${id}`),
  savePrintTemplate: (id: number, name: string, bodyHtml: string) =>
    request<PrintTemplateItem>(`/api/v1/admin/print-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, bodyHtml }),
    }),
  renderPrintTemplate: (id: number, vars: Record<string, string>) => {
    const params = new URLSearchParams(vars);
    return fetch(`/api/v1/print/${id}?${params.toString()}`, { method: 'POST' });
  },
  stationReport: (from: string, to: string) =>
    request<StationCount[]>(`/api/v1/reports/stations?from=${from}&to=${to}`),
  ncpCausesReport: (from: string, to: string) =>
    request<TypeCount[]>(`/api/v1/reports/ncp-causes?from=${from}&to=${to}`),
  info: () => request<{ version: string }>('/api/v1/info'),
};
