export type ProductionPlanItem = {
  vin: string;
  id: number;
  modelArticle: string | null;
  modelName: string | null;
  engineNumber: string | null;
  color: string | null;
  status: string | null;
  statusId: number | null;
  plannedShipmentDate: string | null;
  startDate: string | null;
  completeDate: string | null;
  fokDate: string | null;
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

  plan: (params: { vin?: string; status?: string | null; page: number; pageSize: number }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.vin) query.set('vin', params.vin);
    if (params.status !== undefined && params.status !== null) query.set('status', params.status);
    return request<Paged<ProductionPlanItem>>(`/api/v1/production-plan?${query}`);
  },

  byVin: (vin: string) => request<ProductionPlanItem>(`/api/v1/production-plan/${encodeURIComponent(vin)}`),
};
