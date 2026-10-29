export type ProductionPlanItem = {
  vin: string;
  id: number;
  seqn: number | null;
  modelArticle: string | null;
  modelName: string | null;
  engineNumber: string | null;
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
};

export type ComponentItem = { code: string; name: string; station: string | null };

export type ModelRef = { article: string; name: string };
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

/** Ошибка API с кодом — UI различает 401 (нет доступа) и 404 (не найдено). */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
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
    throw new ApiError(response.status, `Ошибка запроса (${response.status})`);
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

  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),

  statuses: () => request<(string | null)[]>('/api/v1/production-plan/statuses'),

  plan: (params: { vin?: string; status?: string | null; statusId?: number; page: number; pageSize: number }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.vin) query.set('vin', params.vin);
    if (params.status !== undefined && params.status !== null) query.set('status', params.status);
    if (params.statusId !== undefined) query.set('statusId', String(params.statusId));
    return request<Paged<ProductionPlanItem>>(`/api/v1/production-plan?${query}`);
  },

  /** Перестановка порядка. Существует только в демо-режиме сервера. */
  move: (vin: string, toPosition: number) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toPosition }),
    }),

  byVin: (vin: string) => request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}`),

  /** Печать JobCard — отмечает PrintDate, статус не меняет. Существует только в демо-режиме сервера. */
  print: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/print`, { method: 'POST' }),

  /** Запуск в производство (0 → 1). Существует только в демо-режиме сервера. */
  start: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/start`, { method: 'POST' }),

  /** Завершение сборки (1 → 2). Существует только в демо-режиме сервера. */
  complete: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/complete`, { method: 'POST' }),

  /** Final OK (2 → 3). Блокируется незакрытой обязательной деталью — см. ncpMissingParts. */
  fok: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/fok`, { method: 'POST' }),

  /** Отправка в Rework (2 → 4). Существует только в демо-режиме сервера. */
  sendToRework: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/rework`, { method: 'POST' }),

  /** Завершение Rework (4 → 2). Блокируется незакрытой обязательной деталью — как FOK. */
  finishRework: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/rework/finish`, { method: 'POST' }),

  planImportReference: () => request<PlanReference>('/api/v1/plan-import/reference'),

  /** Загружает сырые строки на проверку — временная область (раздел 6.1). Существует только в демо-режиме. */
  stageImport: (rows: ImportRawRow[], source: string) =>
    request<ImportSession>('/api/v1/plan-import/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, source }),
    }),

  /** Исправление строки «прямо в строке» — заново проверяет всю загрузку. */
  replaceImportRow: (sessionId: string, rowNumber: number, row: ImportRawRow) =>
    request<ImportSession>(`/api/v1/plan-import/sessions/${encodeURIComponent(sessionId)}/rows/${rowNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    }),

  /** Публикация в конец очереди. Доступна только при нуле ошибок — проверяется и на сервере. */
  publishImport: (sessionId: string) =>
    request<{ published: number }>(`/api/v1/plan-import/sessions/${encodeURIComponent(sessionId)}/publish`, {
      method: 'POST',
    }),

  ncpTypes: () => request<string[]>('/api/v1/ncp/types'),
  ncpStations: () => request<string[]>('/api/v1/ncp/stations'),
  ncpComponents: () => request<ComponentItem[]>('/api/v1/ncp/components'),

  /** NCP с неустановленной обязательной деталью по изделию — то, что блокирует допуск к FOK. */
  ncpMissingParts: (vin: string) => request<NcpItem[]>(`/api/v1/ncp/missing-parts?vin=${encodeURIComponent(vin)}`),

  ncpList: (params: { vin?: string; status?: string | null; page: number; pageSize: number }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.vin) query.set('vin', params.vin);
    if (params.status) query.set('status', params.status);
    return request<Paged<NcpItem>>(`/api/v1/ncp?${query}`);
  },

  /** Регистрация несоответствия. Существует только в демо-режиме сервера. */
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

  /** Отметки проверки компонентов по изделию (Этап 5), ключ — код компонента. */
  stationChecks: (vin: string) => request<Record<string, ComponentCheck>>(`/api/v1/stations/${encodeURIComponent(vin)}/checks`),

  /** Отметить/снять проверку компонента. Существует только в демо-режиме сервера. */
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

  // --- Входной контроль (Этап 9, разделы 19-24) -----------------------------

  suppliers: () => request<SupplierRef[]>('/api/v1/incoming-inspection/suppliers'),

  incomingComponents: () => request<ComponentItem[]>('/api/v1/incoming-inspection/components'),

  /** Добавление неизвестного артикула в справочник (раздел 19, [С]) — прямо из строки с ошибкой. */
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

  packageByHu: (deliveryId: string, hu: string) =>
    request<DeliveryPackage>(`/api/v1/incoming-inspection/deliveries/${encodeURIComponent(deliveryId)}/packages/by-hu/${encodeURIComponent(hu)}`),

  /** Вставка Packing List во временную область — тот же паттерн, что импорт плана (Этап 8). */
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

  /** Результат проверки строки: OK (скан/подтверждение) либо Брак/Пересорт/Недостача с причиной. */
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
};
