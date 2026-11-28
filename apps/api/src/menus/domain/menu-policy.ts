// MH-10: the staff can write, change or delete the menu of a slot only before the slot starts.
// From its start on, the menu stays as it is: for slots in the past the menus remain fixed.
export function isMenuEditable(startsAt: Date, now: Date): boolean {
  return now.getTime() < startsAt.getTime();
}
