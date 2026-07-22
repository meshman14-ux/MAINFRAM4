import { useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import Home from './pages/Home';
import OpsConsole from './pages/OpsConsole';
import EventsRegister from './pages/EventsRegister';
import Calendar from './pages/Calendar';
import StaffHub from './pages/StaffHub';
import Callouts from './pages/Callouts';
import Onboarding from './pages/Onboarding';
import Readiness from './pages/Readiness';
import Compliance from './pages/Compliance';
import StockOrdering from './pages/StockOrdering';
import Finance from './pages/Finance';
import Timesheets from './pages/Timesheets';
import Pipeline from './pages/Pipeline';
import Logistics from './pages/Logistics';
import Tasks from './pages/Tasks';
import ClientPortal from './pages/ClientPortal';
import Login from './pages/Login';
import SetNewPassword from './pages/SetNewPassword';
import { useAccess } from './data/useAccess';
import { AuthContext } from './data/authContext';
import './styles/tokens.css';
import './styles/home.css';
import './styles/console.css';
import './styles/phase4.css';
import './styles/phase5.css';
import './styles/phase6.css';
import './styles/pipeline.css';
import './styles/logistics.css';
import './styles/tasks.css';
import './styles/timesheets.css';
import './styles/portal.css';
import './styles/auth.css';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

interface RouteDef { page: string; el: React.ReactNode; roles: ('owner'|'manager'|'crew'|'client')[]; }

// Which routes each role may reach. RLS enforces data scope server-side;
// this just decides which screens the nav offers and guards direct hash access.
const ROUTES: Record<string, RouteDef> = {
  home:     { page: 'Home',      el: <Home />,          roles: ['owner', 'manager'] },
  console:  { page: 'Console',   el: <OpsConsole />,    roles: ['owner', 'manager'] },
  callouts: { page: 'Callouts',  el: <Callouts />,      roles: ['owner', 'manager'] },
  onboard:  { page: 'Onboard',   el: <Onboarding />,    roles: ['owner', 'manager'] },
  readiness:{ page: 'Readiness', el: <Readiness />,     roles: ['owner', 'manager'] },
  compliance:{ page: 'Compliance', el: <Compliance />,  roles: ['owner', 'manager'] },
  stock:    { page: 'Stock',     el: <StockOrdering />, roles: ['owner', 'manager'] },
  finance:  { page: 'Finance',   el: <Finance />,       roles: ['owner', 'manager'] },
  timesheets: { page: 'Timesheets', el: <Timesheets />, roles: ['owner', 'manager'] },
  pipeline: { page: 'Pipeline',  el: <Pipeline />,      roles: ['owner', 'manager'] },
  logistics:{ page: 'Logistics', el: <Logistics />,     roles: ['owner', 'manager'] },
  tasks:    { page: 'Tasks',     el: <Tasks />,         roles: ['owner', 'manager'] },
  portal:   { page: 'My Events', el: <ClientPortal />,  roles: ['client'] },
  events:   { page: 'Events',    el: <EventsRegister />, roles: ['owner', 'manager', 'client'] },
  calendar: { page: 'Calendar',  el: <Calendar />,      roles: ['owner', 'manager', 'client'] },
  staff:    { page: 'Staff Hub', el: <StaffHub />,      roles: ['owner', 'manager', 'crew'] },
};

/** Landing route per role after login. */
function homeRouteFor(role: string): string {
  if (role === 'crew') return 'staff';
  if (role === 'client') return 'portal';
  return 'home';
}

export default function App() {
  const auth = useAccess();
  const hash = useHashRoute();

  if (auth.loading) {
    return <div className="state"><div><div className="spinner" /><div className="eyebrow">Starting MAINFRAME</div></div></div>;
  }

  // Not signed in → login screen.
  if (!auth.session) return <Login auth={auth} />;

  // Arrived via a password-reset email link → set a new password first.
  if (auth.isRecovery) return <SetNewPassword auth={auth} />;

  // Signed in but no mf_access row yet → provisioning notice.
  if (!auth.access) {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-pending">
          <div className="eyebrow">Account pending</div>
          <p className="auth-sub" style={{ marginBottom: 18 }}>
            You're signed in as <strong>{auth.email}</strong>, but your access
            hasn't been set up yet. Ask your operator to add you.
          </p>
          <button className="auth-btn" onClick={auth.signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  const role = auth.access.role;
  const requested = hash.replace(/^#\//, '').split('/')[0] || homeRouteFor(role);
  const match = ROUTES[requested];

  // Guard: if the role can't reach the requested route, send it to its home.
  const allowed = match && match.roles.includes(role);
  const active = allowed ? match : ROUTES[homeRouteFor(role)];

  return (
    <AuthContext.Provider value={auth}>
      <div className="app-shell">
        <TopBar current={active.page} role={role} email={auth.email} onSignOut={auth.signOut} />
        {active.el}
      </div>
    </AuthContext.Provider>
  );
}
