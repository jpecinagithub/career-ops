import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Evaluator from './pages/Evaluator.jsx';
import Applications from './pages/Applications.jsx';
import ApplicationDetail from './pages/ApplicationDetail.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Scanner from './pages/Scanner.jsx';
import Settings from './pages/Settings.jsx';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } }
});

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="evaluate" element={<Evaluator />} />
            <Route path="applications" element={<Applications />} />
            <Route path="applications/:id" element={<ApplicationDetail />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{
        style: { background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }
      }} />
    </QueryClientProvider>
  );
}
