/**
 * ACCDB file import types and schemas.
 * Handles reading and transforming barber data from Microsoft Access databases.
 */

import { z } from 'zod';

/**
 * Raw row from ACCDB barber table.
 * Flexible schema to handle various column names and formats.
 */
export type AccdbRawRow = Record<string, unknown>;

/**
 * Validated barber row after parsing from ACCDB.
 * Can be transformed into BarberSetting.
 */
export const AccdbBarberRowSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1, 'Barber name is required'),
  yclients_id: z.number().int().positive('YCLIENTS ID must be positive'),
  slug: z.string().optional(),
  template: z.string().optional(),
  enabled: z.boolean().optional().default(true),
});

export type AccdbBarberRow = z.infer<typeof AccdbBarberRowSchema>;

/**
 * Import result with barbers and any errors.
 */
export type AccdbImportResult = {
  success: boolean;
  barbers: AccdbBarberRow[];
  errors: string[];
  warnings: string[];
  rowsProcessed: number;
  rowsValid: number;
  rowsSkipped: number;
};

/**
 * ACCDB file metadata.
 */
export type AccdbFileInfo = {
  fileName: string;
  fileSizeMB: number;
  tables: string[];
  barberTableName: string;
};

/**
 * Validation result for a single row.
 */
export type AccdbRowValidation = {
  valid: boolean;
  row?: AccdbBarberRow;
  error?: string;
  rowIndex: number;
};

/**
 * Configuration for ACCDB import.
 */
export type AccdbImportConfig = {
  /** Table name to read from (default: "barbers", "мастера", "masters") */
  tableName?: string;
  /** Auto-detect table name if not found */
  autoDetectTable?: boolean;
  /** Mapping of column names to expected field names */
  columnMapping?: Record<string, string>;
  /** Whether to skip validation for unknown columns */
  strict?: boolean;
  /** Maximum rows to import (0 = all) */
  maxRows?: number;
};

/**
 * Normalized field mapping for flexible ACCDB column parsing.
 * Maps various common column names to standardized fields.
 */
export const FIELD_MAPPING: Record<string, string[]> = {
  name: ['name', 'displayName', 'display_name', 'barber_name', 'мастер', 'имя'],
  yclients_id: ['yclients_id', 'yclientsId', 'yclients_staff_id', 'staff_id', 'staffId', 'id_yclients'],
  slug: ['slug', 'username', 'code', 'abbreviation'],
  template: ['template', 'template_name', 'template_id'],
  enabled: ['enabled', 'active', 'is_active', 'status'],
};

/**
 * Allowed table names for barber data (case-insensitive).
 */
export const ALLOWED_TABLE_NAMES = [
  'barbers',
  'masters',
  'мастера',
  'мастер',
  'staff',
  'employees',
  'сотрудники',
];
