/**
 * ACCDB Service: Read and import barber data from Microsoft Access databases.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import MDBReader from 'mdb-reader';
import { logger } from '../../lib/logger.js';
import {
  AccdbImportConfig,
  AccdbImportResult,
  AccdbBarberRow,
  AccdbBarberRowSchema,
  AccdbRawRow,
  AccdbRowValidation,
  FIELD_MAPPING,
  ALLOWED_TABLE_NAMES,
} from './types.js';
import type { BarberSetting } from '../../config/settings.js';

/**
 * AccdbService handles reading and parsing ACCDB files.
 */
export class AccdbService {
  /**
   * Read and parse barber data from ACCDB file.
   *
   * @param filePath - Path to .accdb file
   * @param config - Import configuration
   * @returns Parsed and validated barbers
   */
  importFromFile(filePath: string, config?: AccdbImportConfig): AccdbImportResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      logger.info('Starting ACCDB import', { path: filePath });

      // Read file
      const buffer = readFileSync(filePath);
      const fileName = basename(filePath);

      // Parse ACCDB
      let reader: MDBReader;
      try {
        reader = new MDBReader(buffer);
      } catch (err) {
        const msg = `Failed to parse ACCDB file: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        logger.error(msg, { filePath });
        return {
          success: false,
          barbers: [],
          errors,
          warnings,
          rowsProcessed: 0,
          rowsValid: 0,
          rowsSkipped: 0,
        };
      }

      // Get all table names
      const allTableNames = reader.getTableNames();

      // Find barber table
      const tableName = this.findBarberTable(allTableNames, config?.tableName);
      if (!tableName) {
        const msg = `No barber table found. Available tables: ${allTableNames.join(', ')}`;
        errors.push(msg);
        logger.warn(msg, { tables: allTableNames });
        return {
          success: false,
          barbers: [],
          errors,
          warnings,
          rowsProcessed: 0,
          rowsValid: 0,
          rowsSkipped: 0,
        };
      }

      logger.info('Found barber table', { fileName, tableName });

      // Get table and data
      let table: any;
      let records: AccdbRawRow[];
      try {
        table = reader.getTable(tableName);
        records = table.getData() || [];
      } catch (err) {
        const msg = `Failed to read table "${tableName}": ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        logger.error(msg, { tableName });
        return {
          success: false,
          barbers: [],
          errors,
          warnings,
          rowsProcessed: 0,
          rowsValid: 0,
          rowsSkipped: 0,
        };
      }

      if (!Array.isArray(records) || records.length === 0) {
        errors.push(`Table "${tableName}" is empty`);
        logger.warn(`Table "${tableName}" is empty`, {});
        return {
          success: false,
          barbers: [],
          errors,
          warnings,
          rowsProcessed: 0,
          rowsValid: 0,
          rowsSkipped: 0,
        };
      }

      // Parse rows
      let rowsProcessed = 0;
      let rowsValid = 0;
      let rowsSkipped = 0;
      const barbers: AccdbBarberRow[] = [];

      const maxRows = config?.maxRows || 0;
      const toProcess = maxRows > 0 ? Math.min(records.length, maxRows) : records.length;

      for (let i = 0; i < toProcess; i++) {
        const raw = records[i];
        if (!raw || typeof raw !== 'object') {
          rowsProcessed++;
          rowsSkipped++;
          warnings.push(`Row ${i}: Invalid row data`);
          continue;
        }

        rowsProcessed++;

        const validation = this.validateRow(raw as AccdbRawRow, i, config?.columnMapping);
        if (!validation.valid) {
          rowsSkipped++;
          if (validation.error) {
            warnings.push(`Row ${i}: ${validation.error}`);
          }
          continue;
        }

        if (validation.row) {
          barbers.push(validation.row);
          rowsValid++;
        }
      }

      logger.info('ACCDB import completed successfully', {
        rowsProcessed,
        rowsValid,
        rowsSkipped,
        fileName,
      });

      return {
        success: true,
        barbers,
        errors,
        warnings,
        rowsProcessed,
        rowsValid,
        rowsSkipped,
      };
    } catch (err) {
      const msg = `ACCDB import error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(msg, { filePath });
      return {
        success: false,
        barbers: [],
        errors,
        warnings,
        rowsProcessed: 0,
        rowsValid: 0,
        rowsSkipped: 0,
      };
    }
  }

  /**
   * Find barber table in ACCDB.
   */
  private findBarberTable(tableNames: string[], requestedName?: string): string | null {
    // If name requested, try case-insensitive match first
    if (requestedName) {
      const lower = requestedName.toLowerCase();
      const found = tableNames.find((n) => n.toLowerCase() === lower);
      if (found) return found;
    }

    // Try predefined names
    for (const allowed of ALLOWED_TABLE_NAMES) {
      const found = tableNames.find((n) => n.toLowerCase() === allowed.toLowerCase());
      if (found) return found;
    }

    return null;
  }

  /**
   * Validate and normalize a single ACCDB row.
   */
  private validateRow(
    raw: AccdbRawRow,
    rowIndex: number,
    customMapping?: Record<string, string>
  ): AccdbRowValidation {
    try {
      // Normalize field names
      const normalized = this.normalizeRowFields(raw, customMapping);

      // Validate against schema
      const result = AccdbBarberRowSchema.safeParse(normalized);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        return {
          valid: false,
          error: issues,
          rowIndex,
        };
      }

      return {
        valid: true,
        row: result.data,
        rowIndex,
      };
    } catch (err) {
      return {
        valid: false,
        error: `${err instanceof Error ? err.message : String(err)}`,
        rowIndex,
      };
    }
  }

  /**
   * Normalize field names in ACCDB row to standard names.
   * Handles various column naming conventions.
   */
  private normalizeRowFields(raw: AccdbRawRow, customMapping?: Record<string, string>): AccdbRawRow {
    const normalized: AccdbRawRow = {};
    const mapping = { ...FIELD_MAPPING, ...(customMapping || {}) };

    // Create reverse mapping: columnName -> fieldName
    const columnToField: Record<string, string> = {};
    for (const [field, columnNames] of Object.entries(mapping)) {
      for (const col of columnNames) {
        columnToField[col.toLowerCase()] = field;
      }
    }

    // Normalize input keys
    for (const [key, value] of Object.entries(raw)) {
      const fieldName = columnToField[key.toLowerCase()];
      if (fieldName) {
        normalized[fieldName] = value;
      } else {
        // Keep unknown fields as-is (they'll be ignored by schema)
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Transform validated ACCDB rows to BarberSetting format.
   */
  transformToSettings(barbers: AccdbBarberRow[]): BarberSetting[] {
    return barbers.map((b) => ({
      slug: b.slug || this.generateSlug(b.name),
      displayName: b.name,
      template: b.template || this.generateSlug(b.name),
      staffId: b.yclients_id,
      enabled: b.enabled ?? true,
    }));
  }

  /**
   * Generate slug from display name.
   * Converts to lowercase, removes spaces and special characters.
   * Keeps cyrillic letters, latin letters and digits.
   */
  private generateSlug(name: string): string {
    // Transliterate cyrillic to latin (simplified mapping)
    const translitMap: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    };

    let slug = name
      .toLowerCase()
      .split('')
      .map((char) => translitMap[char] || char)
      .join('')
      .replace(/[^a-z0-9]/g, '') // Remove remaining special chars
      .slice(0, 30);

    return slug || 'unknown';
  }

  /**
   * Merge imported barbers with existing settings.
   * Imported barbers override existing ones with same slug.
   *
   * @param existing - Current barber settings
   * @param imported - Imported barber rows
   * @param overwrite - Whether to replace all existing barbers (default: false)
   * @returns Merged barber settings
   */
  mergeBarbers(existing: BarberSetting[], imported: AccdbBarberRow[], overwrite = false): BarberSetting[] {
    const importedSettings = this.transformToSettings(imported);

    if (overwrite) {
      logger.info('Overwriting all barbers with imported data', { count: importedSettings.length });
      return importedSettings;
    }

    // Merge: imported overrides existing with same slug
    const merged = [...existing];

    for (const imported of importedSettings) {
      const idx = merged.findIndex((b) => b.slug === imported.slug);
      if (idx >= 0) {
        logger.debug('Updating existing barber', { slug: imported.slug });
        merged[idx] = imported;
      } else {
        logger.debug('Adding new barber', { slug: imported.slug });
        merged.push(imported);
      }
    }

    return merged;
  }
}

export const accdbService = new AccdbService();
