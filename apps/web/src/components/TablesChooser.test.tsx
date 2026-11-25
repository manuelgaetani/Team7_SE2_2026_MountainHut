import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SlotDetails } from '@mountain-hut/shared';
import type { TablesChoice, TablesMode } from '../lib/slotTables.ts';
import { json } from '../test/app.tsx';
import { TablesChooser } from './TablesChooser.tsx';
import { chooseDate } from '../test/dates.ts';

const TEXT = {
  modeList: 'Enter the tables',
  modeCopy: 'Copy tables from another slot',
  modeLater: 'Add them later',
  laterHint: 'The slot has 0 seats, and hikers cannot book it, until its tables are defined.',
  tableNo: (row: number) => `Table number, row ${row}`,
  seats: (row: number) => `Seats, row ${row}`,
  removeRow: (row: number) => `Remove row ${row}`,
  addTable: 'Add a table',
  copyDate: 'Day of the slot to copy',
  loadingSlots: 'Loading the slots of the day…',
  noSources: 'No slot with tables on this day.',
  copySelect: 'Copy the tables of',
  chooseSlot: 'Choose a slot',
} as const;

const defaultChoice: TablesChoice = {
  mode: 'list',
  rows: [{ tableNumber: '1', seats: '4' }],
  copyFromSlotId: null,
};

function stubSchedule(handler: (url: string) => Response) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/slots/schedule')) return Promise.resolve(handler(url));
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderChooser({
  initial = defaultChoice,
  modes = ['list', 'copy', 'later'] as TablesMode[],
  copyDate = '2026-11-10',
  excludeSlotId,
  onChangeSpy,
}: {
  initial?: TablesChoice;
  modes?: TablesMode[];
  copyDate?: string;
  excludeSlotId?: number;
  onChangeSpy?: (next: TablesChoice) => void;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Harness() {
    const [choice, setChoice] = useState<TablesChoice>(initial);
    return (
      <TablesChooser
        idPrefix="test"
        modes={modes}
        value={choice}
        onChange={(next) => {
          setChoice(next);
          onChangeSpy?.(next);
        }}
        copyDate={copyDate}
        excludeSlotId={excludeSlotId}
      />
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('TablesChooser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('switches between modes and shows the hint when adding tables later', () => {
    const spy = vi.fn();
    stubSchedule(() => json([]));
    renderChooser({ onChangeSpy: spy });

    expect(screen.getByRole('radio', { name: TEXT.modeList })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: TEXT.modeLater }));
    expect(screen.getByRole('radio', { name: TEXT.modeLater })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(TEXT.laterHint)).toBeVisible();

    fireEvent.click(screen.getByRole('radio', { name: TEXT.modeCopy }));
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'copy' }));
  });

  it('edits table rows, adds rows with next table number, computes totals including blank seats, and removes rows', () => {
    renderChooser({
      initial: {
        mode: 'list',
        rows: [{ tableNumber: '1', seats: '' }],
        copyFromSlotId: null,
      },
    });

    expect(screen.getByText('1 table · 0 seats')).toBeVisible();
    expect(screen.queryByRole('button', { name: TEXT.removeRow(1) })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(TEXT.tableNo(1)), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(TEXT.seats(1)), { target: { value: '6' } });
    expect(screen.getByText('1 table · 6 seats')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: TEXT.addTable }));
    expect(screen.getByLabelText(TEXT.tableNo(2))).toHaveValue(4);
    fireEvent.change(screen.getByLabelText(TEXT.seats(2)), { target: { value: '2' } });
    expect(screen.getByText('2 tables · 8 seats')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: TEXT.removeRow(2) }));
    expect(screen.queryByLabelText(TEXT.tableNo(2))).not.toBeInTheDocument();
    expect(screen.getByText('1 table · 6 seats')).toBeVisible();
  });

  it('handles copy mode loading, empty/excluded slots, slot selection, and date changes', async () => {
    const slotWithTables: SlotDetails = {
      id: 5,
      date: '2026-11-10',
      startTime: '12:00',
      endTime: '14:00',
      tables: [{ tableNumber: 1, seats: 4 }],
      totalSeats: 4,
    };
    const excludedSlot: SlotDetails = {
      id: 9,
      date: '2026-11-10',
      startTime: '19:00',
      endTime: '21:00',
      tables: [{ tableNumber: 2, seats: 6 }],
      totalSeats: 6,
    };
    const emptySlot: SlotDetails = {
      id: 6,
      date: '2026-11-11',
      startTime: '12:00',
      endTime: '14:00',
      tables: [],
      totalSeats: 0,
    };

    const spy = vi.fn();
    const fetchMock = stubSchedule((url) =>
      url.includes('2026-11-10') ? json([slotWithTables, excludedSlot]) : json([emptySlot]),
    );

    renderChooser({
      initial: { ...defaultChoice, mode: 'copy' },
      copyDate: '2026-11-10',
      excludeSlotId: 9,
      onChangeSpy: spy,
    });

    expect(screen.getByRole('status')).toHaveTextContent(TEXT.loadingSlots);

    const select = await screen.findByLabelText(TEXT.copySelect);
    const options = screen.getAllByRole<HTMLOptionElement>('option');
    expect(options.map((o) => o.textContent)).toEqual([
      TEXT.chooseSlot,
      '12:00–14:00 · 1 table · 4 seats',
    ]);

    fireEvent.change(select, { target: { value: '5' } });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ copyFromSlotId: 5 }));

    fireEvent.change(select, { target: { value: '' } });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ copyFromSlotId: null }));

    chooseDate(TEXT.copyDate, '2026-11-11');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ copyFromSlotId: null }));
    expect(await screen.findByText(TEXT.noSources)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots/schedule?date=2026-11-11',
      expect.anything(),
    );
  });
});
