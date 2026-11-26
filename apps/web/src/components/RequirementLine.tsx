import { dietaryOption, hasAllergy, type PartyRequirement } from '@mountain-hut/shared';
import { AllergyBadge } from './AllergyBadge.tsx';
import { DietaryIcon } from './DietaryIcons.tsx';

// One requirement as every page lists it: the allergy mark, the needs of the list with their
// icon and name, then the free text.
export function RequirementLine({ requirement }: { requirement: PartyRequirement }) {
  return (
    <>
      {hasAllergy(requirement) && <AllergyBadge />}
      {requirement.restrictions.map((code) => (
        <span key={code} className="diet-tag">
          <DietaryIcon code={code} className="diet-tag__icon" />
          {dietaryOption(code).label}
        </span>
      ))}
      {requirement.description}
    </>
  );
}
