import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDays, House, LineChart, MessageCircle, UserRound } from 'lucide-react';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { HomePage } from '@/pages/home-page';
import { CoachesPage, CoachPage } from '@/pages/coaches-page';
import { CoachTabPage } from '@/pages/coach-tab-page';
import { OnboardingPage } from '@/pages/onboarding-page';
import { PlanPage } from '@/pages/plan-page';
import { ProgressPage } from '@/pages/progress-page';
import { SessionPage } from '@/pages/session-page';
import { LoginPage } from '@/pages/login-page';
import { ProfilePage } from '@/pages/profile-page';
import { SignupPage } from '@/pages/signup-page';
import { errorStatus } from '@/lib/server-error';

// AI-coach app (pivot, 18 Oct 2026). The creator-marketplace pages (Studio, Create, Explore,
// Library, creator links) stay in src/pages but are no longer routed.
const destinations = [
  { label: 'Today', path: '/', Icon: House, also: [] as string[] },
  { label: 'Plan', path: '/plan', Icon: CalendarDays, also: [] as string[] },
  { label: 'Coach', path: '/coach', Icon: MessageCircle, also: ['/coaches', '/start'] },
  { label: 'Progress', path: '/progress', Icon: LineChart, also: [] as string[] },
  { label: 'Me', path: '/profile', Icon: UserRound, also: [] as string[] },
] as const;

function BottomNavigation() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {destinations.map(({ label, path, Icon, also }) => {
        const active = path === '/' ? pathname === '/' : [path, ...also].some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link key={path} to={path} className="nav-item" aria-current={active ? 'page' : undefined}>
            <Icon size={20} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const me = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request: { credentials: 'include' },
  });
  const loggedOut = me.isError && errorStatus(me.error) === 401;
  // Full-screen places: the logged-out landing page, onboarding, and a live session.
  const onLanding = pathname === '/' && loggedOut;
  const fullScreen = onLanding || pathname.startsWith('/session/') || pathname.startsWith('/start/') || (loggedOut && pathname.startsWith('/coaches'));

  return (
    <div className={onLanding ? 'app-shell app-shell-wide' : 'app-shell'}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/coach" element={<CoachTabPage />} />
        <Route path="/coaches" element={<CoachesPage />} />
        <Route path="/coaches/:coachId" element={<CoachPage />} />
        <Route path="/start/:coachId" element={<OnboardingPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {fullScreen ? null : <BottomNavigation />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
