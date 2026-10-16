import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { CreatePage } from '@/pages/create-page';
import { CreatorRoute } from '@/pages/creator-page';
import { ExploreDetailPage } from '@/pages/explore-detail-page';
import { ExplorePage } from '@/pages/explore-page';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { ProfilePage } from '@/pages/profile-page';
import { SignupPage } from '@/pages/signup-page';
import { errorStatus } from '@/lib/server-error';

const destinations = [
  { label: 'Studio', path: '/' },
  { label: 'Explore', path: '/explore' },
  { label: 'Create', path: '/create' },
  { label: 'Coaching', path: '/coaching' },
  { label: 'Me', path: '/profile' },
] as const;

function BottomNavigation() {
  const { pathname } = useLocation();

  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {destinations.map(({ label, path }) => {
        const active = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link key={path} to={path} className="nav-item" aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Screen({ title }: { title: string }) {
  return (
    <main className="screen-scroll">
      <h1 className="screen-title">{title}</h1>
    </main>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const me = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request: { credentials: 'include' },
  });
  // The logged-out welcome screen is a full-bleed hero with no tab bar.
  const onWelcome = pathname === '/' && me.isError && errorStatus(me.error) === 401;

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/:programId" element={<ExploreDetailPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/coaching" element={<Screen title="Coaching" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/:slug" element={<CreatorRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {onWelcome ? null : <BottomNavigation />}
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
