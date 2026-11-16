import { Injectable } from '@nestjs/common';
import type {
  CreateSlotInput,
  DefineSlotTablesInput,
  FloorPlan,
  SlotDetails,
  SlotTable,
} from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { buildFloorPlan } from '../domain/floor-plan.js';
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
  // 404 if copyTablesFromSlotId does not exist; 409 if the slot overlaps another slot of the same
  // day (issue #31: contiguous slots are allowed) or (raised by the repository) has the same date,
  // start and end. Slots in the past are still accepted: the story does not say otherwise.
  async create(input: CreateSlotInput): Promise<SlotDetails> {
    const slot = { date: input.date, startTime: input.startTime, endTime: input.endTime };
    const id = await this.uow.run(async () => {
      await this.repo.lockDay(slot.date);
      const clash = await this.repo.findOverlapping(slot);
      if (clash) {
        throw new DomainError(
          'CONFLICT',
          `This slot overlaps the slot ${clash.startTime}–${clash.endTime} of the same day`,
        );
      }
      const tables = await this.resolveTables(input);
      const slotId = await this.repo.create(slot);
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

  // Read only: the tables of a slot do not change once defined (MH-19 will change that).
  // 404 if the slot does not exist.
  async floorPlan(id: number): Promise<FloorPlan> {
    const slot = await this.findOne(id);
    const allocations = await this.repo.findFloorAllocations(id);
    return buildFloorPlan(slot, allocations);
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
