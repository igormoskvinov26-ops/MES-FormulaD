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

  /** Запуск в производство (0 → 1). Существует только в демо-режиме сервера. */
  start: (vin: string) =>
    request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}/start`, { method: 'POST' }),

  ncpTypes: () => request<string[]>('/api/v1/ncp/types'),
  ncpStations: () => request<string[]>('/api/v1/ncp/stations'),
  ncpComponents: () => request<ComponentItem[]>('/api/v1/ncp/components'),

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
};
