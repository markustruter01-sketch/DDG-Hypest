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
import { CheckoutReturn } from '@/components/checkout-return';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/password-pages';
import { LegalPage } from '@/pages/legal-page';
import { AdminPage } from '@/pages/admin-page';
import { RemindersOffPage } from '@/pages/reminders-off-page';
import { SaveTimezoneOnce } from '@/components/timezone-setting';
import { PlanNotesWhenPending } from '@/components/plan-notes';
import { TrialPage } from '@/pages/trial-page';

// AI-coach app (pivot, 18 Oct 2026). The creator marketplace was removed in plan step 1.8.
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
  const fullScreen = onLanding || pathname.startsWith('/session/') || pathname.startsWith('/start/') || pathname === '/try' || (loggedOut && pathname.startsWith('/coaches'));

  return (
    <div className={onLanding ? 'app-shell app-shell-wide' : 'app-shell'}>
      <CheckoutReturn />
      {me.data ? <SaveTimezoneOnce /> : null}
      {me.data ? <PlanNotesWhenPending /> : null}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/coach" element={<CoachTabPage />} />
        <Route path="/coaches" element={<CoachesPage />} />
        <Route path="/coaches/:coachId" element={<CoachPage />} />
        <Route path="/start/:coachId" element={<OnboardingPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/try" element={<TrialPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/health" element={<LegalPage kind="health" />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/reminders/off" element={<RemindersOffPage />} />
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
