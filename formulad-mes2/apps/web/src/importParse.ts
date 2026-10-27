import type { ImportRawRow } from './api';

/**
 * Разбор сырого текста в строки импорта — общий для вставки (вкладка — разделитель, так Excel
 * отдаёт скопированный диапазон в буфер обмена) и CSV-файла (запятая). Первая строка — заголовки
 * шаблона, пропускается всегда. ponytail: не парсим бинарный .xlsx — для этого нужна сторонняя
 * библиотека с незакрытыми уязвимостями (prototype pollution/ReDoS в npm-пакете `xlsx`,
 * исправленная сборка недоступна из этой сети); второй равноправный способ ввода из раздела 6.1
 * — это CSV-файл (Excel одинаково легко открывает и сохраняет в этом формате).
 */
export function parseDelimitedRows(text: string): ImportRawRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const dataLines = lines.slice(1); // первая строка — заголовки шаблона

  return dataLines.map((line) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    const cell = (index: number) => (cells[index] ? cells[index] : null);
    return {
      vin: cell(0),
      modelArticle: cell(1),
      engineNumber: cell(2),
      color: cell(3),
      specificationName: cell(4),
      plannedStartDate: cell(5),
      plannedCompleteDate: cell(6),
      plannedShipmentDate: cell(7),
    };
  });
}

export const IMPORT_COLUMNS = [
  'VIN',
  'Артикул модели',
  '№ двигателя',
  'Цвет',
  'Комплектация',
  'Дата старта (план)',
  'Дата завершения (план)',
  'Дата отгрузки (план)',
];
