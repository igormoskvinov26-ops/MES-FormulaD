/**
 * Domain errors with clear, user-safe messages. Stack traces stay in server
 * logs; only `.message` is shown to users.
 */
export class AppError extends Error {
  readonly code: string;
  readonly userMessage: string;
  constructor(code: string, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Known, human-readable error messages (kept in one place per the spec). */
export const Errors = {
  yclientsScheduleUnavailable: () =>
    new AppError('YCLIENTS_SCHEDULE_UNAVAILABLE', 'YCLIENTS schedule unavailable'),
  noWorkingStaff: () => new AppError('NO_WORKING_STAFF', 'No working staff today'),
  noAvailableSlots: () => new AppError('NO_AVAILABLE_SLOTS', 'No available slots'),
  telegramBusinessMissing: () =>
    new AppError('TELEGRAM_BUSINESS_MISSING', 'Telegram Business connection missing'),
  telegramStoryPermissionMissing: () =>
    new AppError('TELEGRAM_STORY_PERMISSION_MISSING', 'Telegram Story permission missing'),
  telegramStoriesNotConfigured: () =>
    new AppError('TELEGRAM_STORIES_NOT_CONFIGURED', 'Telegram Stories not configured'),
  storyRenderingFailed: (cause?: unknown) =>
    new AppError('STORY_RENDERING_FAILED', 'Story rendering failed', cause),
  telegramUnavailable: (cause?: unknown) =>
    new AppError('TELEGRAM_UNAVAILABLE', 'Telegram API unavailable', cause),
  dailyReportSourceIncomplete: () =>
    new AppError('DAILY_REPORT_SOURCE_INCOMPLETE', 'Daily report source incomplete'),
  productionDisabledInTestMode: () =>
    new AppError('PRODUCTION_DISABLED_IN_TEST_MODE', 'Production publishing disabled in TEST mode.'),
  yclientsNotConfigured: () =>
    new AppError('YCLIENTS_NOT_CONFIGURED', 'YCLIENTS credentials are not configured'),
} as const;

/** Extract a user-safe message from any thrown value. */
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.userMessage;
  if (err instanceof Error) return 'Internal error';
  return 'Unknown error';
}
