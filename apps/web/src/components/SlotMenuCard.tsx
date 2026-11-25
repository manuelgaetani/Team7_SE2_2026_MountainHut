import { useId } from 'react';
import { useSlotMenu } from '../api/useMenus.ts';
import { formatPrice } from '../lib/menu.ts';
import { ErrorNotice } from './ErrorNotice.tsx';
import { MenuLegend, MenuMarks } from './MenuIcons.tsx';
import { MenuText } from './MenuText.tsx';
import './Menu.css';

interface SlotMenuCardProps {
  slotId: number;
  // "12:00–14:00", shown next to the title.
  time: string;
}

// MH-10: the menu of the chosen slot, as the hiker reads it before booking.
export function SlotMenuCard({ slotId, time }: SlotMenuCardProps) {
  const titleId = useId();
  const menu = useSlotMenu(slotId);

  return (
    <section className="menu-card" aria-labelledby={titleId}>
      <header className="menu-card__head">
        <h2 id={titleId} className="menu-card__title">
          Menu
        </h2>
        <span className="menu-card__time">Served {time}</span>
      </header>

      {menu.isPending && (
        <p role="status" className="menu-card__state">
          Loading the menu…
        </p>
      )}
      {menu.isError && (
        <div className="menu-card__state">
          <ErrorNotice message="Could not load the menu. Please try again." />
        </div>
      )}
      {menu.isSuccess && menu.data === null && (
        <p className="notice notice--ok menu-card__state">The menu of this slot is not out yet.</p>
      )}
      {menu.isSuccess && menu.data !== null && (
        <>
          <div className="menu-card__courses">
            {menu.data.courses.map((course, c) => (
              <section key={c} className="menu-card__course">
                <h3 className="menu-card__course-name">{course.name}</h3>
                <ul className="menu-card__dishes">
                  {course.dishes.map((dish, d) => (
                    <li key={d} className="menu-dish">
                      <div className="menu-dish__head">
                        <span className="menu-dish__name" lang="it">
                          {dish.name} <MenuMarks marks={dish.marks} />
                        </span>
                        <span className="menu-dish__price">{formatPrice(dish.price)}</span>
                      </div>
                      <p className="menu-dish__translation">{dish.translation}</p>
                      <MenuText text={dish.description} className="menu-text" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <MenuLegend />
        </>
      )}
    </section>
  );
}
