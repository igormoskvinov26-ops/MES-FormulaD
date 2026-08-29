/**
 * Import routes for ACCDB and other data sources.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { accdbService } from '../../services/accdb/index.js';
import { getSettings, updateSettings } from '../../config/settings.js';
import { toUserMessage } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export const importRouter = Router();

// Setup multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept .accdb and .mdb files
    if (file.mimetype === 'application/octet-stream' || file.originalname.match(/\.(accdb|mdb)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .accdb and .mdb files are supported'));
    }
  },
});

function fail(res: Response, err: unknown, status = 400) {
  logger.error('import route error', { error: err instanceof Error ? err.message : String(err) });
  res.status(status).json({ ok: false, error: toUserMessage(err) });
}

/**
 * POST /api/admin/import/accdb
 * Upload and validate ACCDB file
 *
 * Returns preview of barbers that would be imported
 */
importRouter.post('/accdb', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    logger.info('ACCDB import request received', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    // Create temporary file from buffer
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpPath = path.join(os.tmpdir(), `accdb-${Date.now()}.accdb`);

    fs.writeFileSync(tmpPath, req.file.buffer);

    try {
      // Import from file
      const result = accdbService.importFromFile(tmpPath, {
        tableName: req.body.tableName,
        autoDetectTable: true,
        columnMapping: req.body.columnMapping,
        maxRows: req.body.maxRows ? parseInt(req.body.maxRows, 10) : 0,
      });

      if (!result.success) {
        logger.warn('ACCDB import validation failed', {
          errors: result.errors,
          fileName: req.file.originalname,
        });
        return res.status(400).json({
          ok: false,
          error: 'Failed to import ACCDB file',
          details: {
            errors: result.errors,
            warnings: result.warnings,
          },
        });
      }

      // Transform and prepare preview
      const currentSettings = getSettings();
      const importedSettings = accdbService.transformToSettings(result.barbers);

      logger.info('ACCDB import validation successful', {
        rowsProcessed: result.rowsProcessed,
        rowsValid: result.rowsValid,
        barberCount: importedSettings.length,
      });

      res.json({
        ok: true,
        fileName: req.file.originalname,
        preview: {
          rowsProcessed: result.rowsProcessed,
          rowsValid: result.rowsValid,
          rowsSkipped: result.rowsSkipped,
          barbers: importedSettings,
          warnings: result.warnings,
        },
        existing: currentSettings.barbers,
      });
    } finally {
      // Clean up temporary file
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    fail(res, err, 500);
  }
});

/**
 * POST /api/admin/import/accdb/apply
 * Apply imported barber changes to settings
 *
 * Body: {
 *   barbers: AccdbBarberRow[],
 *   overwrite?: boolean (default: false)
 * }
 */
importRouter.post('/accdb/apply', async (req: Request, res: Response) => {
  try {
    const { barbers, overwrite } = req.body;

    if (!Array.isArray(barbers) || barbers.length === 0) {
      return res.status(400).json({ ok: false, error: 'No barbers provided' });
    }

    logger.info('Applying ACCDB import', {
      barberCount: barbers.length,
      overwrite: overwrite ?? false,
    });

    // Get current settings
    const currentSettings = getSettings();

    // Merge barbers
    const mergedBarbers = accdbService.mergeBarbers(currentSettings.barbers, barbers, overwrite);

    // Update settings
    const newSettings = { ...currentSettings, barbers: mergedBarbers };
    await updateSettings(newSettings);

    logger.info('ACCDB import applied successfully', {
      totalBarbers: mergedBarbers.length,
      activeBarbers: mergedBarbers.filter((b) => b.enabled && b.staffId > 0).length,
    });

    res.json({
      ok: true,
      message: 'Settings updated successfully',
      barbers: mergedBarbers,
    });
  } catch (err) {
    fail(res, err, 500);
  }
});

/**
 * POST /api/admin/import/accdb/verify
 * Verify ACCDB file without applying changes
 *
 * Just validation, no side effects
 */
importRouter.post('/accdb/verify', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    logger.info('ACCDB verification request', {
      fileName: req.file.originalname,
    });

    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpPath = path.join(os.tmpdir(), `accdb-verify-${Date.now()}.accdb`);

    fs.writeFileSync(tmpPath, req.file.buffer);

    try {
      const result = accdbService.importFromFile(tmpPath, {
        autoDetectTable: true,
      });

      res.json({
        ok: result.success,
        fileName: req.file.originalname,
        result: {
          rowsProcessed: result.rowsProcessed,
          rowsValid: result.rowsValid,
          rowsSkipped: result.rowsSkipped,
          barbers: accdbService.transformToSettings(result.barbers),
          errors: result.errors,
          warnings: result.warnings,
        },
      });
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    fail(res, err, 500);
  }
});
