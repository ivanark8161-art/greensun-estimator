import { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import type { AppData } from './types';
import { initAuth, loginWithMicrosoft, isElectron } from './utils/auth';
import AuthGate from './components/AuthGate';

function QuoteDetailRoute({ data, setData }: { data: AppData; setData: (d: AppData) => void }) {
  const { id } = useParams<{ id?: string }>();
  return <QuoteDetail key={id ?? 'new'} data={data} setData={setData} />;
}
import { loadData, loadFromServer, saveData, saveChangesAsync, subscribeToStream } from './utils/storage';
import type { SSEEvent } from './utils/storage';
import Layout        from './components/Layout';
import Dashboard     from './pages/Dashboard';
import Requests      from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import Quotes        from './pages/Quotes';
import QuoteDetail   from './pages/QuoteDetail';
import Clients       from './pages/Clients';
import SnowRemoval   from './pages/SnowRemoval';
import Invoices      from './pages/Invoices';
import TimeTracking  from './pages/TimeTracking';
import Expenses      from './pages/Expenses';
import Schedule      from './pages/Schedule';
import Resources     from './pages/Resources';
import GrowthBudget  from './pages/GrowthBudget';
import Reports       from './pages/Reports';
import Jobs          from './pages/Jobs';
import JobDetail     from './pages/JobDetail';

// ── Sync status shown in a small corner indicator ─────────────────────────────
type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

function SyncIndicator({ status }: { status: SyncStatus }) {
  if (status === 'idle') return null;
  const styles: Record<SyncStatus, string> = {
    idle:   '',
    saving: 'bg-yellow-100 text-yellow-700',
    saved:  'bg-green-100 text-green-700',
    error:  'bg-red-100 text-red-700',
  };
  const labels: Record<SyncStatus, string> = {
    idle:   '',
    saving: '⟳ Saving…',
    saved:  '✓ Saved',
    error:  '⚠ Cloud save failed — data saved locally',
  };
  return (
    <div className={`fixed bottom-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-full shadow z-50 transition-all ${styles[status]}`}>
      {labels[status]}
    </div>
  );
}

// ── Apply an SSE patch to AppData without triggering a save ───────────────────
function applySSEPatch(data: AppData, event: SSEEvent): AppData {
  const { collection, operation, doc, docId } = event;
  if (!collection) return data;

  if (collection === 'settings' && doc) {
    return { ...data, settings: doc as unknown as AppData['settings'] };
  }
  if (collection === 'counters' && doc) {
    return { ...data, ...(doc as Partial<AppData>) };
  }

  const key = collection as keyof AppData;
  if (!(key in data) || !Array.isArray(data[key])) return data;

  const arr = data[key] as { id: string }[];

  if (operation === 'delete') {
    return { ...data, [key]: arr.filter(i => i.id !== docId) };
  }

  if (doc) {
    const item = doc as { id: string };
    const exists = arr.some(i => i.id === item.id);
    return {
      ...data,
      [key]: exists ? arr.map(i => i.id === item.id ? item as typeof i : i) : [...arr, item as typeof arr[0]],
    };
  }

  return data;
}

export default function App() {
  const [data, setDataRaw] = useState<AppData>(() => loadData());
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [needsWebLogin, setNeedsWebLogin] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // prevDataRef tracks the last version sent to the server — used for diffing
  const prevDataRef = useRef<AppData>(data);
  // sseActive prevents SSE-received updates from triggering a save back to server
  const fromSSE = useRef(false);

  // setData: called by every page on user action — diffs and saves only changes
  const setData = useCallback(async (newData: AppData) => {
    const prev = prevDataRef.current;
    prevDataRef.current = newData;
    setDataRaw(newData);

    if (fromSSE.current) {
      // This update came from SSE; don't echo it back to the server
      fromSSE.current = false;
      return;
    }

    setSyncStatus('saving');
    if (syncTimer.current) clearTimeout(syncTimer.current);

    const ok = await saveChangesAsync(prev, newData);

    setSyncStatus(ok ? 'saved' : 'error');
    syncTimer.current = setTimeout(() => setSyncStatus('idle'), ok ? 3000 : 8000);
  }, []);

  // Load server data and sync — called after auth is confirmed
  const loadAndSync = useCallback(async () => {
    try {
      const serverData = await loadFromServer();

      if (serverData) {
        // Server has real data — always use it. Server is the source of truth.
        // Never overwrite it with local data on load (would erase other users' changes).
        setDataRaw(serverData);
        prevDataRef.current = serverData;
        saveData(serverData);
      } else {
        // Server is empty — first-time setup. Push local data up.
        const local = loadData();
        const localHasRealData = (local.contracts?.length ?? 0) > 0
          || (local.clients?.length  ?? 0) > 0
          || (local.employees?.length ?? 0) > 0;
        if (localHasRealData) {
          prevDataRef.current = local;
          const blank: AppData = { ...local, clients: [], contracts: [], jobs: [], invoices: [], snowTrips: [], timeEntries: [], expenses: [], employees: [], equipment: [], overhead: [], fieldSupplies: [], subcontractors: [], crews: [], projects: [], requests: [], leads: [], futureBudget: [], contractTemplates: [], salesTaxRates: [], serviceCatalog: [] };
          const ok = await saveChangesAsync(blank, local);
          if (!ok) setSyncStatus('error');
        }
      }
    } catch {
      // Server unreachable — local data already loaded
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: init auth, then load/sync data
  useEffect(() => {
    const init = async () => {
      if (isElectron) {
        const { token } = await initAuth();
        if (!token) { setAuthError(true); setAuthReady(true); return; }
        setAuthReady(true);
        await loadAndSync();
      } else {
        // Web: check for a cached Microsoft session (e.g. after page refresh)
        const { token } = await initAuth();
        if (!token) { setNeedsWebLogin(true); setAuthReady(true); return; }
        setAuthReady(true);
        await loadAndSync();
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Web login handler — triggered by the "Sign in with Microsoft" button
  const handleWebLogin = useCallback(async () => {
    setNeedsWebLogin(false);
    setAuthReady(false);
    const { token } = await loginWithMicrosoft();
    if (!token) { setAuthError(true); setAuthReady(true); return; }
    setAuthReady(true);
    await loadAndSync();
  }, [loadAndSync]);

  // SSE subscription — merge server-pushed changes without saving them back
  useEffect(() => {
    if (!authReady) return;
    const unsubscribe = subscribeToStream((event: SSEEvent) => {
      if (event.type === 'connected') return; // ignore the initial handshake
      setDataRaw(prev => {
        const next = applySSEPatch(prev, event);
        if (next === prev) return prev; // nothing changed
        prevDataRef.current = next;     // keep the diff ref in sync
        saveData(next);                 // update localStorage
        return next;
      });
    });
    return unsubscribe;
  }, [authReady]);

  if (!authReady)    return <AuthGate loading />;
  if (needsWebLogin) return <AuthGate login onLogin={handleWebLogin} />;
  if (authError)     return <AuthGate error />;

  return (
    <HashRouter>
      <SyncIndicator status={syncStatus} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index                    element={<Dashboard    data={data} />} />
          <Route path="requests"          element={<Requests     data={data} setData={setData} />} />
          <Route path="requests/new"      element={<Requests     data={data} setData={setData} />} />
          <Route path="requests/:id"      element={<RequestDetail data={data} setData={setData} />} />
          <Route path="quotes"            element={<Quotes       data={data} setData={setData} />} />
          <Route path="quotes/new"        element={<QuoteDetailRoute data={data} setData={setData} />} />
          <Route path="quotes/:id"        element={<QuoteDetailRoute data={data} setData={setData} />} />
          <Route path="estimator"         element={<Navigate to="/quotes/new" replace />} />
          <Route path="pipeline"          element={<Navigate to="/requests"   replace />} />
          <Route path="clients"             element={<Clients      data={data} setData={setData} />} />
          <Route path="clients/:id"       element={<Clients      data={data} setData={setData} />} />
          <Route path="projects"          element={<Navigate to="/jobs" replace />} />
          <Route path="projects/:id"      element={<Navigate to="/jobs" replace />} />
          <Route path="jobs"              element={<Jobs         data={data} setData={setData} />} />
          <Route path="jobs/:id"          element={<JobDetail    data={data} setData={setData} />} />
          <Route path="contracts"         element={<Navigate to="/jobs" replace />} />
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
    </HashRouter>
  );
}
