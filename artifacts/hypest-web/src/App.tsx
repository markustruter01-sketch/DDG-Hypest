import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { CreatePage } from '@/pages/create-page';
import { CreatorRoute } from '@/pages/creator-page';
import { ExploreDetailPage } from '@/pages/explore-detail-page';
import { ExplorePage } from '@/pages/explore-page';
import { HomePage, StudioPage } from '@/pages/home-page';
import { LibraryPage } from '@/pages/library-page';
import { PlayerPage } from '@/pages/player-page';
import { LoginPage } from '@/pages/login-page';
import { ProfilePage } from '@/pages/profile-page';
import { SignupPage } from '@/pages/signup-page';
import { errorStatus } from '@/lib/server-error';

const destinations = [
  { label: 'Studio', path: '/studio' },
  { label: 'Explore', path: '/explore' },
  { label: 'Create', path: '/create' },
  { label: 'Library', path: '/library' },
  { label: 'Me', path: '/profile' },
] as const;

function BottomNavigation() {
  const { pathname } = useLocation();

  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {destinations.map(({ label, path }) => {
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link key={path} to={path} className="nav-item" aria-current={active ? 'page' : undefined}>
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
  // The logged-out landing page is full width (phone and PC) with no tab bar.
  const onLanding = pathname === '/' && me.isError && errorStatus(me.error) === 401;

  return (
    <div className={onLanding ? 'app-shell app-shell-wide' : 'app-shell'}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/:programId" element={<ExploreDetailPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/train/:programId" element={<PlayerPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/:slug" element={<CreatorRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {onLanding || pathname.startsWith('/train/') ? null : <BottomNavigation />}
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
