import type { ProductionPlanItem } from './api';
import { dash, formatDate } from './format';

export type Column = {
  key: string;
  label: string;
  /** Колонку нельзя скрыть: без VIN строка перестаёт быть опознаваемой. */
  locked?: boolean;
  value: (item: ProductionPlanItem) => string;
};

/** Колонки в том же порядке, что на экране плана в Access. */
export const COLUMNS: Column[] = [
  { key: 'seqn', label: 'Порядок', value: (i) => dash(i.seqn) },
  { key: 'vin', label: 'VIN', locked: true, value: (i) => i.vin },
  { key: 'modelArticle', label: 'Модель', value: (i) => dash(i.modelArticle) },
  { key: 'modelName', label: 'Наименование', value: (i) => dash(i.modelName) },
  { key: 'engineNumber', label: '№ двигателя', value: (i) => dash(i.engineNumber) },
  { key: 'color', label: 'Цвет', value: (i) => dash(i.color) },
  { key: 'specificationName', label: 'Комплектация', value: (i) => dash(i.specificationName) },
  { key: 'printDate', label: 'Напечатано', value: (i) => formatDate(i.printDate) },
  { key: 'plannedStartDate', label: 'Старт · план', value: (i) => formatDate(i.plannedStartDate) },
  { key: 'plannedCompleteDate', label: 'Завершение · план', value: (i) => formatDate(i.plannedCompleteDate) },
  { key: 'startDate', label: 'Старт · факт', value: (i) => formatDate(i.startDate) },
  { key: 'completeDate', label: 'Завершение · факт', value: (i) => formatDate(i.completeDate) },
  { key: 'fokDate', label: 'ФОК', value: (i) => formatDate(i.fokDate) },
  { key: 'plannedShipmentDate', label: 'Отгрузка · план', value: (i) => formatDate(i.plannedShipmentDate) },
  { key: 'status', label: 'Статус (строка БД)', value: (i) => dash(i.status) },
];

/** По умолчанию показываем набор экрана Access, фактические даты — по желанию. */
export const DEFAULT_VISIBLE = COLUMNS.filter(
  (c) => !['startDate', 'completeDate', 'fokDate', 'plannedShipmentDate', 'status', 'modelName'].includes(c.key),
).map((c) => c.key);
