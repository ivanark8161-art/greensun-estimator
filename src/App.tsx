import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import type { AppData } from './types';
import { initAuth, isElectron } from './utils/auth';
import AuthGate from './components/AuthGate';

function QuoteDetailRoute({ data, setData }: { data: AppData; setData: (d: AppData) => void }) {
  const { id } = useParams<{ id?: string }>();
  return <QuoteDetail key={id ?? 'new'} data={data} setData={setData} />;
}
import { loadData, loadFromServer, saveData } from './utils/storage';
import Layout        from './components/Layout';
import Dashboard     from './pages/Dashboard';
import Requests      from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import Quotes        from './pages/Quotes';
import QuoteDetail   from './pages/QuoteDetail';
import Clients       from './pages/Clients';
import Projects      from './pages/Projects';
import SnowRemoval   from './pages/SnowRemoval';
import Invoices      from './pages/Invoices';
import TimeTracking  from './pages/TimeTracking';
import Expenses      from './pages/Expenses';
import Schedule      from './pages/Schedule';
import Resources     from './pages/Resources';
import GrowthBudget  from './pages/GrowthBudget';
import Reports       from './pages/Reports';

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [authReady, setAuthReady] = useState(!isElectron);
  const [authError, setAuthError] = useState(false);

  // On mount: init auth (Electron only), then pull from server (source of truth).
  useEffect(() => {
    const init = async () => {
      if (isElectron) {
        const { token } = await initAuth();
        if (!token) { setAuthError(true); setAuthReady(true); return; }
      }
      setAuthReady(true);
      loadFromServer().then(serverData => {
        if (serverData) { setData(serverData); saveData(serverData); }
      }).catch(() => {});
    };
    init();
  }, []);

  if (!authReady) return <AuthGate loading />;
  if (authError)  return <AuthGate error />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index                    element={<Dashboard    data={data} />} />
          <Route path="requests"          element={<Requests     data={data} setData={setData} />} />
          <Route path="requests/:id"      element={<RequestDetail data={data} setData={setData} />} />
          <Route path="quotes"            element={<Quotes       data={data} setData={setData} />} />
          <Route path="quotes/new"        element={<QuoteDetailRoute data={data} setData={setData} />} />
          <Route path="quotes/:id"        element={<QuoteDetailRoute data={data} setData={setData} />} />
          <Route path="estimator"         element={<Navigate to="/quotes/new" replace />} />
          <Route path="pipeline"          element={<Navigate to="/requests"   replace />} />
          <Route path="clients"           element={<Clients      data={data} setData={setData} />} />
          <Route path="clients/new"       element={<Clients      data={data} setData={setData} />} />
          <Route path="clients/:id"       element={<Clients      data={data} setData={setData} />} />
          <Route path="projects"          element={<Projects     data={data} setData={setData} />} />
          <Route path="projects/:id"      element={<Projects     data={data} setData={setData} />} />
          <Route path="contracts"         element={<Projects     data={data} setData={setData} />} />
          <Route path="snow"              element={<SnowRemoval  data={data} setData={setData} />} />
          <Route path="invoices"          element={<Invoices     data={data} setData={setData} />} />
          <Route path="time"              element={<TimeTracking data={data} setData={setData} />} />
          <Route path="expenses"          element={<Expenses     data={data} setData={setData} />} />
          <Route path="schedule"          element={<Schedule     data={data} />} />
          <Route path="resources"         element={<Resources    data={data} setData={setData} />} />
          <Route path="growth"            element={<GrowthBudget data={data} setData={setData} />} />
          <Route path="reports"           element={<Reports      data={data} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
