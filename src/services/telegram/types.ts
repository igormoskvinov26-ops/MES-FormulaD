/** Telegram Story link/media area, in Telegram's normalized coordinate system. */
export type StoryArea = {
  /** Position as percentages of the media (0..100). */
  position: {
    x_percentage: number;
    y_percentage: number;
    width_percentage: number;
    height_percentage: number;
    rotation_angle: number;
  };
  /** A link area pointing at the booking URL. */
  type: { type: 'link'; url: string };
};

export type SendTarget = 'test' | 'production';

export type TelegramSendResult = {
  ok: boolean;
  dryRun: boolean;
  destination: string;
  messageId?: number;
  storyId?: number;
  /** When Stories are not configured, we surface a clear status instead of throwing. */
  status?: 'sent' | 'telegram_stories_not_configured' | 'dry_run';
};

export type BusinessConnectionStatus = {
  configured: boolean;
  connected: boolean;
  canManageStories: boolean;
  /** Raw human-readable note for the dashboard (no secrets). */
  note: string;
};
