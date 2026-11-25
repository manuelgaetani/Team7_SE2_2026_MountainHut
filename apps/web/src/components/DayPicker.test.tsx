import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayPicker } from './DayPicker.tsx';

describe('DayPicker', () => {
  it('renders radio buttons for dates and triggers onChange when clicked', () => {
    const onChange = vi.fn();
    const dates = ['2030-01-15', '2030-01-16'];

    render(<DayPicker dates={dates} value="2030-01-15" onChange={onChange} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(radios[1]);
    expect(onChange).toHaveBeenCalledWith('2030-01-16');
  });

  it('renders empty radiogroup when dates is empty', () => {
    const onChange = vi.fn();
    render(<DayPicker dates={[]} value="2030-01-15" onChange={onChange} />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('names the radiogroup with the default or a custom label', () => {
    const { rerender } = render(
      <DayPicker dates={['2030-01-15']} value="2030-01-15" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('radiogroup', { name: 'When are you coming?' })).toBeInTheDocument();
    rerender(
      <DayPicker dates={['2030-01-15']} value="2030-01-15" onChange={vi.fn()} label="New day" />,
    );
    expect(screen.getByRole('radiogroup', { name: 'New day' })).toBeInTheDocument();
  });

  describe('calendar', () => {
    const dates = ['2030-01-15', '2030-01-17', '2030-02-03'];
    const openCalendar = () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'January 2030, choose a date from the calendar' }),
      );
    const calendar = () => within(screen.getByRole('group', { name: 'Calendar' }));

    it('opens from the month button, on the month of the chosen day, focused on it', () => {
      render(<DayPicker dates={dates} value="2030-01-15" onChange={vi.fn()} />);
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
      openCalendar();
      expect(calendar().getByText('January 2030')).toBeInTheDocument();
      expect(calendar().getByRole('button', { name: 'Tue 15 Jan' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(calendar().getByRole('button', { name: 'Tue 15 Jan' })).toHaveFocus();
      expect(
        screen.getByRole('button', { name: /choose a date from the calendar/ }),
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('lets only the days with slots be chosen', () => {
      render(<DayPicker dates={dates} value="2030-01-15" onChange={vi.fn()} />);
      openCalendar();
      expect(calendar().getByRole('button', { name: 'Thu 17 Jan' })).toBeEnabled();
      expect(calendar().getByRole('button', { name: 'Wed 16 Jan' })).toBeDisabled();
    });

    it('starts the weeks on Monday', () => {
      render(<DayPicker dates={dates} value="2030-01-15" onChange={vi.fn()} />);
      openCalendar();
      // 1 January 2030 is a Tuesday: one blank cell before it.
      const grid = document.querySelector('.calendar__grid')!;
      expect(grid.children[7]).toBeEmptyDOMElement();
      expect(grid.children[8]).toHaveTextContent('1');
    });

    it('picks a day, closes and gives the focus back to the month button', () => {
      const onChange = vi.fn();
      render(<DayPicker dates={dates} value="2030-01-15" onChange={onChange} />);
      openCalendar();
      fireEvent.click(calendar().getByRole('button', { name: 'Thu 17 Jan' }));
      expect(onChange).toHaveBeenCalledWith('2030-01-17');
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /choose a date from the calendar/ })).toHaveFocus();
    });

    it('moves between the months that have slots only', () => {
      const onChange = vi.fn();
      render(<DayPicker dates={dates} value="2030-01-15" onChange={onChange} />);
      openCalendar();
      expect(calendar().getByRole('button', { name: 'Previous month' })).toBeDisabled();
      fireEvent.click(calendar().getByRole('button', { name: 'Next month' }));
      expect(calendar().getByText('February 2030')).toBeInTheDocument();
      expect(calendar().getByRole('button', { name: 'Next month' })).toBeDisabled();
      fireEvent.click(calendar().getByRole('button', { name: 'Sun 3 Feb' }));
      expect(onChange).toHaveBeenCalledWith('2030-02-03');
    });

    it('closes on Escape without letting the key reach a dialog around it', () => {
      const onDocumentKey = vi.fn();
      document.addEventListener('keydown', onDocumentKey);
      render(<DayPicker dates={dates} value="2030-01-15" onChange={vi.fn()} />);
      openCalendar();
      fireEvent.keyDown(calendar().getByRole('button', { name: 'Tue 15 Jan' }), { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
      expect(onDocumentKey).not.toHaveBeenCalled();
      document.removeEventListener('keydown', onDocumentKey);
    });

    it('closes on a click outside and on a second click of the month button', () => {
      render(
        <>
          <p>Outside</p>
          <DayPicker dates={dates} value="2030-01-15" onChange={vi.fn()} />
        </>,
      );
      openCalendar();
      fireEvent.mouseDown(screen.getByText('Outside'));
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
      openCalendar();
      openCalendar();
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
    });
  });
});
