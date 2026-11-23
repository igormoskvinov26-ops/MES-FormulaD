import type { ImportRawRow, PackingListRawRow } from './api';

function splitRows(text: string): string[][] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  return lines.slice(1).map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

export function parseDelimitedRows(text: string): ImportRawRow[] {
  return splitRows(text).map((cells) => {
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

export function parsePackingListRows(text: string): PackingListRawRow[] {
  return splitRows(text).map((cells) => {
    const cell = (index: number) => (cells[index] ? cells[index] : null);
    return {
      packageNumber: cell(0),
      article: cell(1),
      componentName: cell(2),
      quantity: cell(3),
      netWeight: cell(4),
      grossWeight: cell(5),
      batch: cell(6),
    };
  });
}

export const PACKING_LIST_COLUMNS = [
  'Упаковка (HU)',
  'Артикул',
  'Наименование',
  'Количество',
  'Вес нетто',
  'Вес брутто',
  'Партия',
];
