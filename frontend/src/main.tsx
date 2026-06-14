import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, ArrowRightLeft, FileUp, LayoutDashboard, LogIn, ReceiptText, RefreshCw, Users } from 'lucide-react';
import './index.css';
import { api } from './api';
import type { BalanceSummary, BalanceTrace, Expense, Group, ImportReport, Membership, Settlement } from './types';

type Page = 'dashboard' | 'groups' | 'expenses' | 'settlements' | 'import' | 'balances';

function money(value: string | number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));
}

function App() {
  const [token, setToken] = useState(api.token);
  const [page, setPage] = useState<Page>('dashboard');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [error, setError] = useState('');

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  async function loadGroups() {
    const data = await api.groups();
    setGroups(data);
    setSelectedGroupId(current => current || data[0]?.id || '');
  }

  useEffect(() => {
    if (token) loadGroups().catch(e => setError(e.message));
  }, [token]);

  if (!token) return <AuthScreen onLogin={value => { api.setToken(value); setToken(value); }} />;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-slate-200 bg-white px-4 py-5">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-slate-500">Shared Expenses</div>
          <div className="text-xl font-semibold text-ink">Spreetail Split</div>
        </div>
        <select className="focus-ring mb-5 w-full rounded border border-slate-300 bg-white px-3 py-2" value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
          {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <nav className="space-y-1">
          <NavButton icon={<LayoutDashboard size={18} />} label="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
          <NavButton icon={<Users size={18} />} label="Groups" active={page === 'groups'} onClick={() => setPage('groups')} />
          <NavButton icon={<ReceiptText size={18} />} label="Expenses" active={page === 'expenses'} onClick={() => setPage('expenses')} />
          <NavButton icon={<ArrowRightLeft size={18} />} label="Settlements" active={page === 'settlements'} onClick={() => setPage('settlements')} />
          <NavButton icon={<FileUp size={18} />} label="Import CSV" active={page === 'import'} onClick={() => setPage('import')} />
          <NavButton icon={<RefreshCw size={18} />} label="Balance Summary" active={page === 'balances'} onClick={() => setPage('balances')} />
        </nav>
      </aside>
      <main className="ml-64 px-8 py-7">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{selectedGroup?.name ?? 'No group selected'}</h1>
            <p className="text-sm text-slate-600">CSV-first expense management with timeline-aware balances.</p>
          </div>
          <button className="focus-ring rounded border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => loadGroups()}>Refresh</button>
        </header>
        {error && <Notice tone="bad" text={error} />}
        {selectedGroupId && page === 'dashboard' && <Dashboard groupId={selectedGroupId} />}
        {page === 'groups' && <Groups groups={groups} reload={loadGroups} selectedGroupId={selectedGroupId} />}
        {selectedGroupId && page === 'expenses' && <Expenses groupId={selectedGroupId} />}
        {selectedGroupId && page === 'settlements' && <Settlements groupId={selectedGroupId} />}
        {selectedGroupId && page === 'import' && <ImportCsv groupId={selectedGroupId} />}
        {selectedGroupId && page === 'balances' && <Balances groupId={selectedGroupId} />}
      </main>
    </div>
  );
}

function AuthScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('Aisha');
  const [username, setUsername] = useState('aisha');
  const [email, setEmail] = useState('aisha@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = mode === 'login'
        ? await api.login(email, password)
        : await api.register(displayName, username, email, password);
      onLogin(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-[1fr_420px]">
      <section className="flex flex-col justify-end bg-[url('https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center p-12 text-white">
        <h1 className="max-w-3xl text-5xl font-semibold">Shared expenses that explain themselves</h1>
        <p className="mt-4 max-w-xl text-lg text-white/90">Import the messy CSV, surface every anomaly, and trace balances back to exact rows.</p>
      </section>
      <form onSubmit={submit} className="flex flex-col justify-center bg-white px-10">
        <LogIn className="mb-4 text-fern" />
        <h2 className="text-2xl font-semibold">{mode === 'login' ? 'Login' : 'Register'}</h2>
        <div className="mt-5 space-y-3">
          {mode === 'register' && <Input label="Display name" value={displayName} onChange={setDisplayName} />}
          {mode === 'register' && <Input label="Username" value={username} onChange={setUsername} />}
          <Input label="Email" value={email} onChange={setEmail} />
          <Input label="Password" type="password" value={password} onChange={setPassword} />
        </div>
        {error && <Notice tone="bad" text={error} />}
        <button className="focus-ring mt-5 rounded bg-fern px-4 py-2 font-medium text-white">{mode === 'login' ? 'Login' : 'Create account'}</button>
        <button type="button" className="mt-3 text-sm text-fern" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account?' : 'Already registered?'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ groupId }: { groupId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<BalanceSummary | null>(null);
  useEffect(() => {
    Promise.all([api.expenses(groupId), api.balances(groupId)]).then(([e, b]) => { setExpenses(e); setBalances(b); });
  }, [groupId]);
  const total = expenses.reduce((sum, e) => sum + Number(e.convertedAmount), 0);
  return <div className="grid grid-cols-3 gap-4">
    <Metric label="Imported expenses" value={expenses.length.toString()} />
    <Metric label="Tracked amount" value={money(total)} />
    <Metric label="Open settlements" value={(balances?.settlements.length ?? 0).toString()} />
  </div>;
}

function Groups({ groups, reload, selectedGroupId }: { groups: Group[]; reload: () => Promise<void>; selectedGroupId: string }) {
  const [name, setName] = useState('');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  useEffect(() => { if (selectedGroupId) api.memberships(selectedGroupId).then(setMemberships); }, [selectedGroupId]);
  return <div className="space-y-5">
    <Panel title="Create group">
      <div className="flex gap-3">
        <input className="focus-ring flex-1 rounded border border-slate-300 px-3 py-2" value={name} onChange={e => setName(e.target.value)} placeholder="Group name" />
        <button className="focus-ring rounded bg-fern px-4 py-2 text-white" onClick={async () => { await api.createGroup(name); setName(''); await reload(); }}>Create</button>
      </div>
    </Panel>
    <Panel title="Membership timeline">
      <div className="overflow-hidden rounded border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-mist text-left"><tr><th className="p-3">Member</th><th>Joined</th><th>Left</th></tr></thead>
          <tbody>{memberships.map(m => <tr className="border-t" key={m.id}><td className="p-3">{m.displayName}</td><td>{m.joinedOn}</td><td>{m.leftOn ?? 'Active'}</td></tr>)}</tbody>
        </table>
      </div>
    </Panel>
  </div>;
}

function Expenses({ groupId }: { groupId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  useEffect(() => { api.expenses(groupId).then(setExpenses); }, [groupId]);
  return <Panel title="Expenses">
    <div className="space-y-3">{expenses.map(e => <div key={e.id} className="rounded border border-slate-200 bg-white p-4">
      <div className="flex justify-between"><div><div className="font-medium">{e.description}</div><div className="text-sm text-slate-500">{e.expenseDate} · paid by {e.paidBy} · {e.splitType}</div></div><div className="font-semibold">{money(e.convertedAmount)}</div></div>
      <div className="mt-3 flex flex-wrap gap-2">{e.splits.map(s => <span key={s.userId} className="rounded bg-mist px-2 py-1 text-xs">{s.displayName}: {money(s.amount)}</span>)}</div>
    </div>)}</div>
  </Panel>;
}

function Settlements({ groupId }: { groupId: string }) {
  const [items, setItems] = useState<Settlement[]>([]);
  useEffect(() => { api.settlements(groupId).then(setItems); }, [groupId]);
  return <Panel title="Settlements">
    <div className="space-y-2">{items.map(s => <div className="flex justify-between rounded border border-slate-200 bg-white p-3" key={s.id}>
      <span>{s.paidBy} paid {s.paidTo} on {s.settlementDate}</span><b>{money(s.convertedAmount)}</b>
    </div>)}</div>
  </Panel>;
}

function ImportCsv({ groupId }: { groupId: string }) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try { setReport(await api.importCsv(groupId, file)); } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <Panel title="CSV Import">
      <label className="flex cursor-pointer items-center justify-center gap-3 rounded border border-dashed border-slate-400 bg-white p-8 text-slate-600">
        <FileUp /> <span>{busy ? 'Importing...' : 'Choose Expenses Export.csv'}</span>
        <input type="file" accept=".csv" className="hidden" onChange={e => upload(e.target.files?.[0])} />
      </label>
      {error && <Notice tone="bad" text={error} />}
    </Panel>
    {report && <ImportReportView report={report} />}
  </div>;
}

function ImportReportView({ report }: { report: ImportReport }) {
  const counts = [
    ['Rows', report.totalRows], ['Accepted', report.acceptedRows], ['Skipped', report.skippedRows],
    ['Blocked', report.blockedRows], ['Review', report.reviewRows]
  ];
  return <Panel title={`Import Report · ${report.status}`}>
    <div className="mb-4 grid grid-cols-5 gap-3">{counts.map(([label, value]) => <Metric key={label} label={String(label)} value={String(value)} />)}</div>
    <div className="overflow-hidden rounded border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-mist text-left"><tr><th className="p-3">Row</th><th>Type</th><th>Action</th><th>Message</th></tr></thead>
        <tbody>{report.anomalies.map(a => <tr className="border-t align-top" key={a.id}><td className="p-3">{a.rowNumber}</td><td>{a.type}</td><td><Badge action={a.action} /></td><td className="py-3">{a.message}</td></tr>)}</tbody>
      </table>
    </div>
  </Panel>;
}

function Balances({ groupId }: { groupId: string }) {
  const [summary, setSummary] = useState<BalanceSummary | null>(null);
  const [trace, setTrace] = useState<BalanceTrace | null>(null);
  useEffect(() => { api.balances(groupId).then(setSummary); }, [groupId]);
  return <div className="grid grid-cols-[1fr_1.4fr] gap-5">
    <Panel title="Net balances">
      <div className="space-y-2">{summary?.balances.map(b => <div key={b.userId} className="flex justify-between rounded border border-slate-200 bg-white p-3"><span>{b.displayName}</span><b className={Number(b.netAmount) >= 0 ? 'text-fern' : 'text-coral'}>{money(b.netAmount)}</b></div>)}</div>
    </Panel>
    <Panel title="Suggested settlements">
      <div className="space-y-2">{summary?.settlements.map(s => <button className="focus-ring flex w-full justify-between rounded border border-slate-200 bg-white p-3 text-left" key={`${s.fromUserId}-${s.toUserId}`} onClick={() => api.trace(groupId, s.fromUserId, s.toUserId).then(setTrace)}>
        <span>{s.fromUser} pays {s.toUser}</span><b>{money(s.amount)}</b>
      </button>)}</div>
    </Panel>
    {trace && <Panel title="Balance explanation">
      <div className="space-y-2">{trace.lines.map(line => <div key={`${line.sourceId}-${line.amount}`} className="rounded border border-slate-200 bg-white p-3">
        <div className="flex justify-between"><b>{line.description}</b><span>{money(line.amount)}</span></div>
        <div className="text-sm text-slate-500">{line.date} · {line.reason}</div>
      </div>)}</div>
    </Panel>}
  </div>;
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={`focus-ring flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm ${active ? 'bg-ink text-white' : 'text-slate-700 hover:bg-mist'}`} onClick={onClick}>{icon}{label}</button>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-3 text-lg font-semibold">{title}</h2>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}

function Notice({ tone, text }: { tone: 'bad' | 'good'; text: string }) {
  return <div className={`my-3 flex items-center gap-2 rounded border px-3 py-2 text-sm ${tone === 'bad' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><AlertTriangle size={16} />{text}</div>;
}

function Badge({ action }: { action: string }) {
  const cls = action === 'BLOCK' ? 'bg-red-100 text-red-800' : action === 'REVIEW' ? 'bg-amber-100 text-amber-800' : action === 'SKIP' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800';
  return <span className={`rounded px-2 py-1 text-xs font-medium ${cls}`}>{action}</span>;
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-slate-600">{label}</span><input className="focus-ring w-full rounded border border-slate-300 px-3 py-2" type={type} value={value} onChange={e => onChange(e.target.value)} /></label>;
}

createRoot(document.getElementById('root')!).render(<App />);

