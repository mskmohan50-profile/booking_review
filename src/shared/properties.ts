/**
 * The four properties in scope. The `id` is used as a stable primary key in the
 * database, so it must not change when a marketing name is updated.
 */
export interface Property {
  id: string;
  name: string;
  shortName: string;
  url: string;
  accent: string;
}

export const PROPERTIES: Property[] = [
  {
    id: 'olympic-paddington',
    name: 'Olympic Hotel Paddington',
    shortName: 'Olympic Paddington',
    url: 'https://www.booking.com/hotel/au/olympic-paddington.html',
    accent: '#2563eb',
  },
  {
    id: 'potts-point',
    name: 'Potts Point',
    shortName: 'Potts Point',
    url: 'https://www.booking.com/hotel/au/venus-potts-point-sydney.html',
    accent: '#7c3aed',
  },
  {
    id: 'central-sydney',
    name: 'Central Sydney',
    shortName: 'Central Sydney',
    url: 'https://www.booking.com/hotel/au/venus-surry-hills.html',
    accent: '#0891b2',
  },
  {
    id: 'darling-harbour',
    name: 'Darling Harbour',
    shortName: 'Darling Harbour',
    url: 'https://www.booking.com/hotel/au/chateau-de-venus.html',
    accent: '#db2777',
  },
];

export const PROPERTY_IDS = PROPERTIES.map((property) => property.id);

export function propertyById(id: string): Property | undefined {
  return PROPERTIES.find((property) => property.id === id);
}
