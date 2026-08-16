/** Types describing the subset of YCLIENTS data this module consumes. */

export type StaffScheduleEntry = {
  staffId: number;
  displayName: string;
  /** Whether the staff member has a shift on the requested date. */
  worksToday: boolean;
  /** Shift boundaries in HH:mm (business tz), when provided by the schedule. */
  shiftStart: string | null;
  shiftEnd: string | null;
};

/** A bookable free window for a staff member on a date. */
export type FreeSlot = {
  /** HH:mm in business tz. */
  time: string;
  /** Original datetime string from the API, if available. */
  datetime?: string;
  /** Whether YCLIENTS marks this as bookable. */
  bookable: boolean;
};

/** Per-staff daily aggregation for the report. */
export type StaffDailyResult = {
  staffId: number;
  displayName: string;
  clients: number | null;
  revenue: number | null;
  averageCheck: number | null;
};

/** Raw daily figures pulled from YCLIENTS records/finance. */
export type DailyFigures = {
  completedVisits: number | null;
  clients: number | null;
  revenueTotal: number | null;
  revenueServices: number | null;
  revenueProducts: number | null;
  paidVisits: number | null;
  cancellations: number | null;
  noShows: number | null;
  perStaff: StaffDailyResult[];
};

export type FutureBookings = {
  /** New future bookings created today (if determinable). */
  createdToday: number | null;
  createdTodayAmount: number | null;
  /** Total outstanding future bookings (if determinable). */
  totalOutstanding: number | null;
  totalOutstandingAmount: number | null;
};

/** A YCLIENTS "record" (visit/appointment) — only fields we use. */
export type YclientsRecord = {
  id: number;
  staff_id: number;
  staff?: { id: number; name?: string };
  date: string; // "YYYY-MM-DD HH:mm:ss"
  datetime?: string;
  attendance: number; // -1 no-show, 0 waiting, 1 arrived, 2 confirmed
  deleted?: boolean;
  paid_full?: number;
  services?: Array<{ id: number; title?: string; cost?: number; amount?: number; first_cost?: number }>;
  goods_transactions?: Array<{ cost?: number; amount?: number }>;
  client?: { id: number } | null;
  create_date?: string;
  visit_attendance?: number;
};
