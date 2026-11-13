import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreateSlotInput,
  DefineSlotTablesInput,
  RepeatWeeklyScheduleInput,
  RepeatWeeklyScheduleResult,
  SlotDetails,
  SlotTable,
} from '@mountain-hut/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, projectWeeklySchedule } from './repeat-schedule-calculator.js';
import { SlotsRepository } from './slots.repository.js';
import type { SlotRow, TableRow } from './slots.repository.js';

type Tx = Prisma.TransactionClient;

// Dates and times are the hut's local values, stored without time zone: a DATE and two TIME
// columns. Prisma maps them to JS Dates at UTC midnight / on 1970-01-01 UTC.
const toDbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const toDbTime = (time: string): Date => new Date(`1970-01-01T${time}:00.000Z`);
const fromDbDate = (date: Date): string => date.toISOString().slice(0, 10);
const fromDbTime = (time: Date): string => time.toISOString().slice(11, 16);

const toDetails = (slot: SlotRow): SlotDetails => ({
  id: slot.id,
  date: fromDbDate(slot.date),
  startTime: fromDbTime(slot.startTime),
  endTime: fromDbTime(slot.endTime),
  tables: slot.tables,
  totalSeats: slot.tables.reduce((sum, t) => sum + t.seats, 0),
});

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

// MH-02: employees define the tables and seats available in each time slot.
@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SlotsRepository,
  ) {}

  // Creates a slot, optionally with its tables (a list, or a copy of another slot's tables).
  // 404 if copyTablesFromSlotId does not exist, 409 if a slot with the same date, start and end exists.
  async create(input: CreateSlotInput): Promise<SlotDetails> {
    // TODO(MH-02): overlapping slots and slots in the past are accepted for now; the team is
    // deciding whether to ask the product owner. Add the checks here if they must be refused.
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const tables = await this.resolveTables(tx, input);
        const slotId = await this.repo.create(tx, {
          date: toDbDate(input.date),
          startTime: toDbTime(input.startTime),
          endTime: toDbTime(input.endTime),
        });
        if (tables) await this.repo.createTables(tx, slotId, tables);
        return slotId;
      });
      return await this.findOne(id);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('A slot with the same date, start and end already exists');
      }
      throw e;
    }
  }

  // Slots of one day, ordered by start time, each with its tables and total seats.
  async listByDate(date: string): Promise<SlotDetails[]> {
    const slots = await this.repo.findByDate(this.prisma, toDbDate(date));
    return slots.map(toDetails);
  }

  // 404 if the slot does not exist.
  async findOne(id: number): Promise<SlotDetails> {
    const slot = await this.repo.findById(this.prisma, id);
    if (!slot) throw new NotFoundException('Slot not found');
    return toDetails(slot);
  }

  // Defines the tables of a slot that has none yet.
  // 404 if the slot (or the slot to copy from) does not exist; 409 if the slot already has tables:
  // changing an existing table set is MH-19.
  async defineTables(id: number, input: DefineSlotTablesInput): Promise<SlotDetails> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.repo.lock(tx, id))) throw new NotFoundException('Slot not found');
      if ((await this.repo.findTables(tx, id)).length > 0) {
        throw new ConflictException('This slot already has tables: changing them is MH-19');
      }
      const tables = await this.resolveTables(tx, input);
      if (tables) await this.repo.createTables(tx, id, tables);
    });
    return this.findOne(id);
  }

  // MH-09: copies the slots of the 7 days starting at sourceStartDate, with their tables, into each
  // of the next repeatWeeks weeks, on the same weekdays. A target week is replaced completely: its
  // slots are deleted first. This is refused if a slot of a target week has reservations (course
  // issue #45), and when the source week has no slots. All or nothing, in one transaction.
  async repeatWeekly(input: RepeatWeeklyScheduleInput): Promise<RepeatWeeklyScheduleResult> {
    const source = input.sourceStartDate;
    const firstTarget = addDays(source, 7);
    const lastTarget = addDays(source, 7 * input.repeatWeeks + 6);

    return this.prisma.$transaction(async (tx) => {
      // Always in date order, so two copies on overlapping weeks cannot deadlock.
      for (let day = firstTarget; day <= lastTarget; day = addDays(day, 1)) {
        await this.repo.lockDay(tx, toDbDate(day));
      }

      const sourceSlots = (
        await this.repo.findBetween(tx, toDbDate(source), toDbDate(addDays(source, 6)))
      ).map(toDetails);
      if (sourceSlots.length === 0) {
        throw new UnprocessableEntityException('Source week contains no time slots to repeat');
      }

      const from = toDbDate(firstTarget);
      const to = toDbDate(lastTarget);
      const [reserved] = await this.repo.findReservedDates(tx, from, to);
      if (reserved) {
        const daysAfterSource = (reserved.getTime() - toDbDate(source).getTime()) / 86_400_000;
        const weekStart = addDays(source, 7 * Math.floor(daysAfterSource / 7));
        throw new ConflictException(
          `The week starting ${weekStart} has reservations: its schedule cannot be replaced`,
        );
      }

      const replaced = await this.repo.findBetween(tx, from, to);
      if (replaced.length > 0) {
        await this.repo.deleteSlots(
          tx,
          replaced.map((s) => s.id),
        );
      }

      const createdSlots: SlotDetails[] = [];
      for (const slot of projectWeeklySchedule(sourceSlots, input.repeatWeeks)) {
        const id = await this.repo.create(tx, {
          date: toDbDate(slot.date),
          startTime: toDbTime(slot.startTime),
          endTime: toDbTime(slot.endTime),
        });
        if (slot.tables.length > 0) await this.repo.createTables(tx, id, slot.tables);
        createdSlots.push({
          id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          tables: slot.tables,
          totalSeats: slot.tables.reduce((sum, t) => sum + t.seats, 0),
        });
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
  private async resolveTables(
    tx: Tx,
    input: { tables?: SlotTable[]; copyTablesFromSlotId?: number },
  ): Promise<TableRow[] | undefined> {
    if (input.tables) return input.tables;
    if (input.copyTablesFromSlotId === undefined) return undefined;

    const source = await this.repo.findById(tx, input.copyTablesFromSlotId);
    if (!source) throw new NotFoundException('The slot to copy the tables from does not exist');
    if (source.tables.length === 0) {
      throw new UnprocessableEntityException('The slot to copy the tables from has no tables');
    }
    return source.tables;
  }
}
