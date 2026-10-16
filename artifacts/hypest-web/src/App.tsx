import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Compass, House, Plus, UserRound, Dumbbell } from 'lucide-react';
import { CreatePage } from '@/pages/create-page';
import { ExploreDetailPage } from '@/pages/explore-detail-page';
import { ExplorePage } from '@/pages/explore-page';
import { LoginPage } from '@/pages/login-page';
import { ProfilePage } from '@/pages/profile-page';
import { SignupPage } from '@/pages/signup-page';

const destinations = [
  { label: 'Home', path: '/', Icon: House },
  { label: 'Explore', path: '/explore', Icon: Compass },
  { label: 'Create', path: '/create', Icon: Plus },
  { label: 'Coaching', path: '/coaching', Icon: Dumbbell },
  { label: 'Profile', path: '/profile', Icon: UserRound },
] as const;

function BottomNavigation() {
  const { pathname } = useLocation();

  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {destinations.map(({ label, path, Icon }) => {
        const active = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
        const isCreate = path === '/create';
        return (
          <Link
            key={path}
            to={path}
            className={`nav-item${isCreate ? ' nav-create' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            title={label}
          >
            {isCreate ? (
              <span className="create-button">
                <Icon className="create-icon" aria-hidden="true" />
              </span>
            ) : (
              <Icon className="nav-icon" aria-hidden="true" />
            )}
            <span className="nav-label">{label}</span>
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
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Screen title="Home" />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/:programId" element={<ExploreDetailPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/coaching" element={<Screen title="Coaching" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNavigation />
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
