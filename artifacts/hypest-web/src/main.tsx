import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { reportUncaughtErrors } from '@/lib/report-error';

// Fonts are served from this site (no Google Fonts request): Anton for headlines, Archivo for the rest.
import '@fontsource/anton/400.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/archivo/800.css';
import './index.css';

const queryClient = new QueryClient();
reportUncaughtErrors();

// Offline shell and install prompt (build plan 1.6). Published site only: a dev server must never be cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}

// The published site is static files, which can't send a frame-ancestors header, so the app itself refuses to
// run inside another site's frame (stops click-jacking, e.g. a hidden "Delete account"). Dev previews are framed.
const framed = import.meta.env.PROD && window.top !== window.self;
if (framed) document.getElementById('root')!.textContent = 'Open Hypest at its own address.';
else createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>,
);
