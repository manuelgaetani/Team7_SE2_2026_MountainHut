import { Injectable } from '@nestjs/common';
import { hikeMoment } from '@mountain-hut/shared';
import type { RegisterHikeData, RegisteredHike } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { decideHikeRegistration, localMoment } from '../domain/hike-registration-policy.js';
import { HikesRepository } from './hikes.repository.port.js';
import { toRegisteredHike } from './to-registered-hike.js';

// MH-20: a hiker registers a planned hike before departure.
@Injectable()
export class RegisterHike {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repo: HikesRepository,
    private readonly config: AppConfig,
  ) {}

  // userId is the logged-in hiker: it comes from the token, never from the body.
  // 403 without a hiker profile; 422 if the departure has already come; 404 if the hike of the
  // list does not exist; 409 if the hike overlaps another hike of the same hiker.
  async execute(userId: number, input: RegisterHikeData, now: Date): Promise<RegisteredHike> {
    const departureAt = hikeMoment(input.departureDate, input.departureTime);
    const returnAt = hikeMoment(input.returnDate, input.returnTime);

    const decision = decideHikeRegistration(
      departureAt,
      localMoment(now, this.config.bookingTimeZone),
    );
    if (!decision.ok) {
      throw new DomainError('UNPROCESSABLE', 'The planned departure must be in the future');
    }

    const hike = await this.uow.run(async () => {
      const hikerId = await this.repo.findHikerIdByUserId(userId);
      if (!hikerId) {
        throw new DomainError('FORBIDDEN', 'A hiker profile is required to register a hike');
      }

      const predefinedHikeId = input.predefinedHikeId ?? null;
      if (predefinedHikeId !== null && !(await this.repo.predefinedHikeExists(predefinedHikeId))) {
        throw new DomainError('NOT_FOUND', 'Predefined hike not found');
      }

      await this.repo.lockHiker(hikerId);
      const clash = await this.repo.findOverlapping(hikerId, departureAt, returnAt);
      if (clash) {
        throw new DomainError(
          'CONFLICT',
          `This hike overlaps your hike to ${clash.destination} ` +
            `(${clash.departureAt.replace('T', ' ')} – ${clash.returnAt.replace('T', ' ')})`,
        );
      }

      return this.repo.create({
        hikerId,
        predefinedHikeId,
        destination: input.destination,
        route: input.route,
        passagePoints: input.passagePoints,
        departureAt,
        returnAt,
      });
    });

    return toRegisteredHike(hike);
  }
}
