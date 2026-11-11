import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './Skeleton';

describe('пустое состояние и скелетон', () => {
  it('заголовок и подсказка доступны как текст, иллюстрация скрыта от скринридеров', () => {
    const { container } = render(<EmptyState title="Ничего не найдено" hint="Измените фильтр" />);
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.getByText('Измените фильтр')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('скелетон помечен занятым и оставляет скринридеру «Загрузка…»', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Загрузка…')).toHaveClass('sr-only');
    expect(container.querySelectorAll('.skel__row')).toHaveLength(3);
  });
});
