import { useState, useEffect, useRef } from 'react';

type Role = 'owner' | 'manager' | 'crew' | 'client';

// Primary tabs stay visible; secondary operator tools go under "More".
const PRIMARY: { label: string; route: string; roles: Role[] }[] = [
  { label: 'Home',      route: '#/',          roles: ['owner', 'manager'] },
  { label: 'My Events', route: '#/portal',    roles: ['client'] },
  { label: 'Overview',  route: '#/overview',  roles: ['owner', 'manager'] },
  { label: 'Console',   route: '#/console',   roles: ['owner', 'manager'] },
  { label: 'Accounts',  route: '#/accounts',  roles: ['owner', 'manager'] },
  { label: 'Pipeline',  route: '#/pipeline',  roles: ['owner', 'manager'] },
  { label: 'Tasks',     route: '#/tasks',     roles: ['owner', 'manager'] },
  { label: 'Callouts',  route: '#/callouts',  roles: ['owner', 'manager'] },
  { label: 'Events',    route: '#/events',    roles: ['owner', 'manager', 'client'] },
  { label: 'Calendar',  route: '#/calendar',  roles: ['owner', 'manager', 'client'] },
  { label: 'Staff Hub', route: '#/staff',     roles: ['owner', 'manager', 'crew'] },
];
const MORE: { label: string; route: string; roles: Role[] }[] = [
  { label: 'Readiness',  route: '#/readiness',  roles: ['owner', 'manager'] },
  { label: 'Compliance', route: '#/compliance', roles: ['owner', 'manager'] },
  { label: 'Stock',      route: '#/stock',      roles: ['owner', 'manager'] },
  { label: 'Finance',    route: '#/finance',    roles: ['owner', 'manager'] },
  { label: 'Timesheets', route: '#/timesheets', roles: ['owner', 'manager'] },
  { label: 'Logistics',  route: '#/logistics',  roles: ['owner', 'manager'] },
  { label: 'Onboard',    route: '#/onboard',    roles: ['owner', 'manager'] },
  { label: 'Diagnostic', route: '#/diagnostic', roles: ['owner', 'manager'] },
  { label: 'Proposal',   route: '#/proposal',   roles: ['owner', 'manager'] },
  { label: 'Impl. Plan', route: '#/plan',       roles: ['owner', 'manager'] },
];

interface Props {
  current?: string;
  role?: Role;
  email?: string | null;
  onSignOut?: () => void;
}

export default function TopBar({ current = 'Home', role, email, onSignOut }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const primary = role ? PRIMARY.filter((t) => t.roles.includes(role)) : PRIMARY;
  const more = role ? MORE.filter((t) => t.roles.includes(role)) : [];
  const moreActive = more.some((t) => t.label === current);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-badge">M_</div>
        <div>
          <div className="brand-name">MAINFRAME</div>
          <div className="brand-sub">FESTIVAL OPERATIONS SYSTEM</div>
        </div>
      </div>
      <nav className="nav" aria-label="Primary">
        {primary.map((t) => (
          <a key={t.label} href={t.route} aria-current={t.label === current ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
        {more.length > 0 && (
          <div className="nav-more" ref={moreRef} style={{ position: 'relative' }}>
            <button
              className="nav-more-btn"
              aria-expanded={moreOpen}
              aria-current={moreActive ? 'page' : undefined}
              onClick={() => setMoreOpen((o) => !o)}
            >
              More ▾
            </button>
            {moreOpen && (
              <div className="nav-more-menu">
                {more.map((t) => (
                  <a key={t.label} href={t.route} onClick={() => setMoreOpen(false)} aria-current={t.label === current ? 'page' : undefined}>
                    {t.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
      <span className="topbar-spacer" />
      {role ? (
        <span className="user-chip">
          <span className="role" data-role={role}>{role}</span>
          {email && <span className="mono" style={{ fontSize: 12 }}>{email}</span>}
          {onSignOut && <button className="signout" onClick={onSignOut}>Sign out</button>}
        </span>
      ) : (
        <span className="topbar-date mono">{today}</span>
      )}
    </header>
  );
}
