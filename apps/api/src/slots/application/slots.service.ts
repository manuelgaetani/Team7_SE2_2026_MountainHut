import { Injectable } from '@nestjs/common';
import type {
  CreateSlotInput,
  DefineSlotTablesInput,
  RepeatWeeklyScheduleInput,
  RepeatWeeklyScheduleResult,
  SlotDetails,
  SlotTable,
} from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { addDays, projectWeeklySchedule } from '../domain/repeat-schedule-calculator.js';
import type { Slot } from '../domain/slot.js';
import { SlotsRepository } from './slots.repository.port.js';

const toDetails = (slot: Slot): SlotDetails => ({
  ...slot,
  totalSeats: slot.tables.reduce((sum, t) => sum + t.seats, 0),
});

// MH-02: employees define the tables and seats available in each time slot.
@Injectable()
export class SlotsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repo: SlotsRepository,
  ) {}

  // Creates a slot, optionally with its tables (a list, or a copy of another slot's tables).
  // 404 if copyTablesFromSlotId does not exist, 409 (raised by the repository) if a slot with the same date, start and end exists.
  async create(input: CreateSlotInput): Promise<SlotDetails> {
    // TODO(MH-02): overlapping slots and slots in the past are accepted for now; the team is
    // deciding whether to ask the product owner. Add the checks here if they must be refused.
    const id = await this.uow.run(async () => {
      const tables = await this.resolveTables(input);
      const slotId = await this.repo.create({
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
      });
      if (tables) await this.repo.createTables(slotId, tables);
      return slotId;
    });
    return this.findOne(id);
  }

  // Slots of one day, ordered by start time, each with its tables and total seats.
  async listByDate(date: string): Promise<SlotDetails[]> {
    const slots = await this.repo.findByDate(date);
    return slots.map(toDetails);
  }

  // 404 if the slot does not exist.
  async findOne(id: number): Promise<SlotDetails> {
    const slot = await this.repo.findById(id);
    if (!slot) throw new DomainError('NOT_FOUND', 'Slot not found');
    return toDetails(slot);
  }

  // Defines the tables of a slot that has none yet.
  // 404 if the slot (or the slot to copy from) does not exist; 409 if the slot already has tables:
  // changing an existing table set is MH-19.
  async defineTables(id: number, input: DefineSlotTablesInput): Promise<SlotDetails> {
    await this.uow.run(async () => {
      if (!(await this.repo.lock(id))) throw new DomainError('NOT_FOUND', 'Slot not found');
      if ((await this.repo.findTables(id)).length > 0) {
        throw new DomainError('CONFLICT', 'This slot already has tables: changing them is MH-19');
      }
      const tables = await this.resolveTables(input);
      if (tables) await this.repo.createTables(id, tables);
    });
    return this.findOne(id);
  }

  // MH-09: copies the slots of the 7 days starting at sourceStartDate, with their tables, into each
  // of the next repeatWeeks weeks, on the same weekdays. A target week is replaced completely: its
  // slots are deleted first. This is refused if a slot of a target week has reservations (course
  // issue #45), and when the source week has no slots. All or nothing, in one unit of work.
  async repeatWeekly(input: RepeatWeeklyScheduleInput): Promise<RepeatWeeklyScheduleResult> {
    const source = input.sourceStartDate;
    const firstTarget = addDays(source, 7);
    const lastTarget = addDays(source, 7 * input.repeatWeeks + 6);

    return this.uow.run(async () => {
      // Always in date order, so two copies on overlapping weeks cannot deadlock.
      for (let day = firstTarget; day <= lastTarget; day = addDays(day, 1)) {
        await this.repo.lockDay(day);
      }

      const sourceSlots = await this.repo.findBetween(source, addDays(source, 6));
      if (sourceSlots.length === 0) {
        throw new DomainError('UNPROCESSABLE', 'Source week contains no time slots to repeat');
      }

      // The day locks stop other changes to the schedule, but a booking locks only its slot row.
      // Locking the target slots first makes a booking in progress either commit before the check,
      // which then sees it, or wait and find its slot gone: never a booking deleted silently.
      await this.repo.lockBetween(firstTarget, lastTarget);
      const [reserved] = await this.repo.findReservedDates(firstTarget, lastTarget);
      if (reserved) {
        const daysAfterSource = (Date.parse(reserved) - Date.parse(source)) / 86_400_000;
        const weekStart = addDays(source, 7 * Math.floor(daysAfterSource / 7));
        throw new DomainError(
          'CONFLICT',
          `The week starting ${weekStart} has reservations: its schedule cannot be replaced`,
        );
      }

      const replaced = await this.repo.findBetween(firstTarget, lastTarget);
      if (replaced.length > 0) await this.repo.deleteSlots(replaced.map((s) => s.id));

      const createdSlots: SlotDetails[] = [];
      for (const slot of projectWeeklySchedule(sourceSlots, input.repeatWeeks)) {
        const id = await this.repo.create({
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        if (slot.tables.length > 0) await this.repo.createTables(id, slot.tables);
        createdSlots.push(
          toDetails({
            id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            tables: slot.tables,
          }),
        );
      }
      createdSlots.sort(
        (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
      );

      return {
        targetWeeks: input.repeatWeeks,
        createdSlotsCount: createdSlots.length,
        replacedSlotsCount: replaced.length,
        createdSlots,
      };
    });
  }

  // The tables given in the request, or a copy of another slot's tables. Undefined if neither.
  // 422 if the slot to copy from has no tables: there would be nothing to copy.
  private async resolveTables(input: {
    tables?: SlotTable[];
    copyTablesFromSlotId?: number;
  }): Promise<SlotTable[] | undefined> {
    if (input.tables) return input.tables;
    if (input.copyTablesFromSlotId === undefined) return undefined;

    const source = await this.repo.findById(input.copyTablesFromSlotId);
    if (!source)
      throw new DomainError('NOT_FOUND', 'The slot to copy the tables from does not exist');
    if (source.tables.length === 0) {
      throw new DomainError('UNPROCESSABLE', 'The slot to copy the tables from has no tables');
    }
    return source.tables;
  }
}
