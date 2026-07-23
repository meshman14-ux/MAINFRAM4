/* ============================================================
   research.ts — default checklist item libraries per unit purpose.
   Builds on generateResearch() (src/data/phase12.ts) for the
   stock / paperwork lists and adds equipment / consumables /
   safety / operational defaults so a unit's six checklists can be
   seeded from its area in one click. Pure + testable.
   ============================================================ */
import { generateResearch } from '../data/phase12';
import type { ChecklistKind, UnitChecklistItem } from '../data/types';

/** Normalise a unit type string to a known area, defaulting to General. */
export function areaOf(type?: string): 'Bar' | 'Coffee' | 'Food' | 'Cocktail' | 'General' {
  const t = (type || '').toLowerCase();
  if (t === 'bar') return 'Bar';
  if (t === 'coffee') return 'Coffee';
  if (t === 'food' || t === 'catering') return 'Food';
  if (t === 'cocktail') return 'Cocktail';
  return 'General';
}

/* Extra libraries not covered by generateResearch's stock/compliance/requirements. */
const EQUIPMENT: Record<string, string[]> = {
  Bar: ['Cellar cooling / remote coolers', 'Beer lines + pythons', 'Glass washer', 'Ice wells', 'Speed rails', 'Tills / card readers', 'Bar blades + tools'],
  Coffee: ['Espresso machine', 'Grinder(s)', 'Water filtration + pump', 'Knock box', 'Milk fridge', 'Takeaway cup dispensers', 'Till / card reader'],
  Food: ['Griddle / fryer', 'Refrigeration', 'Hot-hold unit', 'Prep tables', 'Extraction / canopy', 'Handwash station', 'Till / card reader'],
  Cocktail: ['Shakers + strainers', 'Blenders', 'Ice crusher', 'Garnish station', 'Speed rails', 'Glassware', 'Till / card reader'],
  General: ['Generator', 'Power distribution', 'Lighting rig', 'Tables + service counter', 'Signage', 'Tool kit'],
};
const CONSUMABLES: Record<string, string[]> = {
  Bar: ['Serve-ware (plastics/glass)', 'Ice', 'Garnish', 'CO₂ / gas', 'Line cleaner', 'Bar roll + cloths'],
  Coffee: ['Beans', 'Milk + alternatives', 'Cups + lids', 'Syrups', 'Napkins + stirrers', 'Cleaning tablets'],
  Food: ['Core ingredients', 'Oil', 'Serve-ware', 'Blue roll', 'Sanitiser', 'Gloves + hairnets'],
  Cocktail: ['Spirits + mixers', 'Fresh citrus + garnish', 'Ice (cubed/crushed)', 'Straws + napkins', 'Cups / glassware'],
  General: ['Bin bags', 'Cable ties + gaffer', 'Batteries / fuses', 'Cleaning supplies'],
};
const SAFETY: Record<string, string[]> = {
  Bar: ['Fire extinguisher (in date)', 'First aid kit', 'Spill kit', 'Wet-floor signage', 'Glass bin / sharps'],
  Coffee: ['Fire extinguisher (in date)', 'First aid (burns gel)', 'LPG shut-off tested', 'Hot-surface signage'],
  Food: ['Fire blanket + extinguisher', 'First aid (blue plasters, burns gel)', 'Temp probe + logs', 'Allergen matrix', 'CO detector (if LPG)'],
  Cocktail: ['Fire extinguisher (in date)', 'First aid kit', 'Glass bin / sharps', 'Wet-floor signage'],
  General: ['Fire extinguisher (in date)', 'First aid kit', 'Hi-vis + PPE', 'RCD-protected power'],
};
const OPERATIONAL: Record<string, string[]> = {
  Bar: ['Pitch positioned + levelled', 'Power connected + tested', 'Water + waste sorted', 'Lines cleaned + poured off', 'Float + till set', 'Close-down + cash-up routine agreed'],
  Coffee: ['Pitch positioned + levelled', 'Power/LPG connected + tested', 'Fresh + waste water sorted', 'Machine dialled in', 'Float + till set', 'Close-down + clean agreed'],
  Food: ['Pitch positioned + levelled', 'Power/gas connected + leak-tested', 'Handwash + waste water sorted', 'Fridges at temp (logged)', 'Float + till set', 'Close-down + deep clean agreed'],
  Cocktail: ['Pitch positioned + levelled', 'Power connected + tested', 'Ice supply secured', 'Garnish + prep done', 'Float + till set', 'Close-down routine agreed'],
  General: ['Access route confirmed', 'Power connected + tested', 'Set-up order agreed', 'Comms channel set', 'Close-down routine agreed'],
};

/** Default labels for one checklist kind of a unit area. */
export function defaultLabels(type: string | undefined, kind: ChecklistKind): string[] {
  const area = areaOf(type);
  const r = generateResearch(area);
  switch (kind) {
    case 'stock': return r.stock;
    case 'paperwork': return r.compliance;   // required documents/licences
    case 'equipment': return EQUIPMENT[area];
    case 'consumables': return CONSUMABLES[area];
    case 'safety': return SAFETY[area];
    case 'operational': return OPERATIONAL[area];
    default: return [];
  }
}

/** Seed a fresh checklist's items for a unit area + kind. */
export function seedItems(type: string | undefined, kind: ChecklistKind): UnitChecklistItem[] {
  return defaultLabels(type, kind).map((label, i) => ({ id: `${kind}-${i}`, label, on: false }));
}
