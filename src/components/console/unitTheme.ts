/* Per-type neon colour identity for units — one hue per unit type,
   used consistently across tabs, widgets and the staffing grid. */
export const UNIT_COLORS: Record<string, string> = {
  Bar: 'var(--neon-cyan)',
  Coffee: 'var(--neon-yellow)',
  Food: 'var(--neon-green)',
  Cocktail: 'var(--neon-pink)',
  Catering: 'var(--neon-purple-text)',
  Support: 'var(--neon-blue)',
};

export function unitColor(type?: string): string {
  return UNIT_COLORS[type || ''] || 'var(--neon-blue)';
}

/* Console tab identities — each workbench tab carries its own neon hue. */
export const TAB_COLORS: Record<string, string> = {
  Events: 'var(--neon-cyan)',
  Units: 'var(--neon-pink)',
  Staff: 'var(--neon-green)',
  Stock: 'var(--neon-yellow)',
  Staffing: 'var(--neon-purple-text)',
};
