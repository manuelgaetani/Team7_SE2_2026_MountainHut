import type { SlotMenu } from '../lib/menu.ts';

// Menus of past slots, so the staff can reuse one from the first day. Until the API stores the
// menus (MH-10 integration), they live in the browser only. Negative ids: no real slot.
export const MENU_SEED: SlotMenu[] = [
  {
    slotId: -1,
    date: '2026-11-22',
    startTime: '12:00',
    endTime: '14:00',
    updatedAt: '2026-11-21T18:00:00.000Z',
    courses: [
      {
        name: 'Antipasti',
        dishes: [
          {
            name: "Tagliere di salumi e formaggi d'alpeggio",
            translation: 'Cured meats and alpine pasture cheeses',
            price: 11,
            description:
              '**Speck**, lardo and *bresaola*, with three cheeses of the valley:\n- Toma\n- Fontina\n- Blu di capra\n  - served with chestnut honey',
            marks: ['DAIRY', 'NUTS'],
          },
          {
            name: 'Insalata di mele e noci',
            translation: 'Apple and walnut salad',
            price: 8,
            description: 'Valley apples, walnuts, *mountain greens* and cider vinegar.',
            marks: ['NUTS', 'VEGAN', 'VEGETARIAN'],
          },
        ],
      },
      {
        name: 'Primi',
        dishes: [
          {
            name: 'Canederli in brodo',
            translation: 'Bread dumplings in broth',
            price: 12,
            description: 'Speck and chive dumplings in a **slow beef broth**.',
            marks: ['GLUTEN', 'DAIRY', 'EGG'],
          },
          {
            name: 'Pizzoccheri della Valtellina',
            translation: 'Buckwheat pasta with cabbage and potatoes',
            price: 13,
            description:
              'Buckwheat tagliatelle, savoy cabbage, potatoes, *Casera* and sage butter.',
            marks: ['GLUTEN', 'DAIRY', 'VEGETARIAN'],
          },
        ],
      },
      {
        name: 'Secondi',
        dishes: [
          {
            name: 'Polenta con cervo in umido',
            translation: 'Polenta with venison stew',
            price: 16,
            description: 'Venison slowly cooked in **red wine** with juniper and bay leaf.',
            marks: [],
          },
          {
            name: 'Polenta concia e funghi',
            translation: 'Cheesy polenta with wild mushrooms',
            price: 13,
            description: 'Polenta with melted cheese and butter, *porcini* from the woods.',
            marks: ['DAIRY', 'VEGETARIAN'],
          },
        ],
      },
      {
        name: 'Dolci',
        dishes: [
          {
            name: 'Strudel di mele',
            translation: 'Apple strudel',
            price: 6,
            description: 'Warm, with vanilla sauce.\n- add a scoop of ice cream',
            marks: ['GLUTEN', 'DAIRY', 'EGG', 'NUTS', 'VEGETARIAN'],
          },
          {
            name: 'Torta di grano saraceno',
            translation: 'Buckwheat cake with berry jam',
            price: 5,
            description: 'The cake of the huts: buckwheat, hazelnuts and *lingonberry* jam.',
            marks: ['DAIRY', 'EGG', 'NUTS', 'VEGETARIAN'],
          },
        ],
      },
    ],
  },
  {
    slotId: -2,
    date: '2026-11-21',
    startTime: '19:00',
    endTime: '21:00',
    updatedAt: '2026-11-20T18:00:00.000Z',
    courses: [
      {
        name: 'Antipasti',
        dishes: [
          {
            name: 'Carne salada con rucola',
            translation: 'Cured beef carpaccio with rocket',
            price: 10,
            description: 'Thin slices of *carne salada*, rocket and **aged Trentingrana**.',
            marks: ['DAIRY'],
          },
          {
            name: 'Zuppa di orzo',
            translation: 'Barley soup',
            price: 7,
            description: 'Pearl barley, vegetables of the garden and a touch of speck.',
            marks: ['GLUTEN'],
          },
        ],
      },
      {
        name: 'Primi',
        dishes: [
          {
            name: 'Casunziei alla barbabietola',
            translation: 'Beetroot ravioli with poppy seeds',
            price: 14,
            description: 'Half-moon ravioli, **brown butter**, poppy seeds and smoked ricotta.',
            marks: ['GLUTEN', 'DAIRY', 'EGG', 'VEGETARIAN'],
          },
          {
            name: 'Gnocchi di patate al ragù di cervo',
            translation: 'Potato gnocchi with venison ragù',
            price: 13,
            description: 'Handmade gnocchi with a ragù of venison and juniper.',
            marks: ['GLUTEN', 'EGG'],
          },
        ],
      },
      {
        name: 'Secondi',
        dishes: [
          {
            name: 'Spezzatino di manzo con polenta',
            translation: 'Beef stew with polenta',
            price: 15,
            description: 'Beef stew with *red wine*, served with soft polenta.',
            marks: [],
          },
          {
            name: 'Tofu affumicato con verdure di montagna',
            translation: 'Smoked tofu with mountain vegetables',
            price: 12,
            description: 'Grilled smoked tofu, roasted roots and **wild herbs**.',
            marks: ['SOY', 'VEGAN', 'VEGETARIAN'],
          },
        ],
      },
      {
        name: 'Dolci',
        dishes: [
          {
            name: 'Panna cotta ai frutti di bosco',
            translation: 'Panna cotta with wild berries',
            price: 6,
            description: 'Mountain cream, *wild berries* of the season.',
            marks: ['DAIRY', 'VEGETARIAN'],
          },
          {
            name: 'Kaiserschmarrn',
            translation: 'Shredded pancake with plum jam',
            price: 8,
            description: 'For two:\n- plum jam\n- icing sugar\n  - raisins on request',
            marks: ['GLUTEN', 'DAIRY', 'EGG', 'VEGETARIAN'],
          },
        ],
      },
    ],
  },
  {
    slotId: -3,
    date: '2026-11-20',
    startTime: '12:00',
    endTime: '14:00',
    updatedAt: '2026-11-19T18:00:00.000Z',
    courses: [
      {
        name: 'Primi',
        dishes: [
          {
            name: 'Minestrone di verdure',
            translation: 'Vegetable soup',
            price: 10,
            description: 'Seasonal vegetables, beans and **extra virgin olive oil**.',
            marks: ['VEGAN', 'VEGETARIAN'],
          },
        ],
      },
      {
        name: 'Secondi',
        dishes: [
          {
            name: 'Uova al tegamino con speck',
            translation: 'Fried eggs with speck',
            price: 12,
            description: 'Two eggs, crispy speck and *rye bread*.',
            marks: ['GLUTEN', 'EGG'],
          },
        ],
      },
      {
        name: 'Dolci',
        dishes: [
          {
            name: 'Crostata di mirtilli',
            translation: 'Blueberry tart',
            price: 5,
            description: 'Shortcrust pastry and blueberry jam.',
            marks: ['GLUTEN', 'DAIRY', 'EGG', 'VEGETARIAN'],
          },
        ],
      },
    ],
  },
];
