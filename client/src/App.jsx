import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  Check,
  CircleHelp,
  Factory,
  ListFilter,
  LogOut,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

const emptyFollowup = {
  dateDemande: "",
  disponible: "",
  dateDisponibilite: "",
  dateEnvoi: "",
  dateReception: "",
  renvoye: "NO",
  dateRenvoi: "",
};

async function api(path, token, options = {}) {
  const apiPath = path.startsWith("/api/")
    ? `${import.meta.env.BASE_URL}${path.slice(1)}`
    : path;
  const response = await fetch(apiPath, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "An error occurred.");
  return result;
}

function dateLabel(value) {
  if (!value) return "To be completed";
  const date = value instanceof Date
    ? value
    : typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? new Date(`${value.slice(0, 10)}T00:00:00Z`)
      : new Date(value);
  if (Number.isNaN(date.valueOf())) return "Invalid date";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function dateTimeLabel(value) {
  if (!value) return "Unknown date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "Invalid date";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("sample-token") || "");
  const [user, setUser] = useState(null);
  const [samples, setSamples] = useState([]);
  const [historySamples, setHistorySamples] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [activeView, setActiveView] = useState("suivi");
  const [sampleFilters, setSampleFilters] = useState({});
  const [historyFilters, setHistoryFilters] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [followup, setFollowup] = useState(emptyFollowup);
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    accountType: "supplier",
    company: "",
    phone: "",
    jobTitle: "",
  });
  const [showRegistration, setShowRegistration] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [newReference, setNewReference] = useState({
    reference: "",
    supplierId: "",
    supplierName: "",
    supplierSelection: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function loadWorkspace(authToken, currentUser) {
    const { samples: sampleRows } = await api("/api/samples", authToken);
    setSamples(sampleRows);
    if (currentUser.role === "manager") {
      const [{ suppliers: supplierRows }, { samples: historyRows }] = await Promise.all([
        api("/api/users/suppliers", authToken),
        api("/api/samples/history", authToken),
      ]);
      setSuppliers(supplierRows);
      setHistorySamples(historyRows);
    }
    setSelectedId((current) => sampleRows.some((sample) => String(sample.id) === current)
      ? current
      : String(sampleRows[0]?.id || ""));
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function restoreSession() {
      try {
        const { user: currentUser } = await api("/api/auth/me", token);
        if (cancelled) return;
        setUser(currentUser);
        await loadWorkspace(token, currentUser);
      } catch {
        localStorage.removeItem("sample-token");
        if (!cancelled) {
          setToken("");
          setUser(null);
        }
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, [token]);

  const selectedSample = samples.find((sample) => String(sample.id) === selectedId);

  useEffect(() => {
    if (!selectedSample || user?.role !== "supplier") return;
    setFollowup({
      dateDemande: selectedSample.dateDemande || "",
      disponible: selectedSample.disponible || "",
      dateDisponibilite: selectedSample.dateDisponibilite || "",
      dateEnvoi: selectedSample.dateEnvoi || "",
      dateReception: selectedSample.dateReception || "",
      renvoye: selectedSample.renvoye || "NO",
      dateRenvoi: selectedSample.dateRenvoi || "",
    });
  }, [selectedId, selectedSample, user?.role]);

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api("/api/auth/login", "", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      localStorage.setItem("sample-token", result.token);
      setUser(result.user);
      setToken(result.token);
      await loadWorkspace(result.token, result.user);
      setMessage({ type: "success", text: "Signed in successfully." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api("/api/auth/register", "", {
        method: "POST",
        body: JSON.stringify(registration),
      });
      localStorage.setItem("sample-token", result.token);
      setUser(result.user);
      setToken(result.token);
      await loadWorkspace(result.token, result.user);
      setMessage({ type: "success", text: "Account created. Welcome!" });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem("sample-token");
    setToken("");
    setUser(null);
    setSamples([]);
    setHistorySamples([]);
    setSuppliers([]);
    setSelectedId("");
    setActiveView("suivi");
    setMessage(null);
  }

  async function saveSupplier(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const path = editingSupplier
        ? editingSupplier.kind === "account"
          ? `/api/users/suppliers/${editingSupplier.id}`
          : `/api/suppliers/directory/${editingSupplier.id}`
        : "/api/suppliers/directory";
      const supplierData = editingSupplier?.kind === "account"
        ? { ...newSupplier, company: newSupplier.name }
        : newSupplier;
      await api(path, token, {
        method: editingSupplier ? "PATCH" : "POST",
        body: JSON.stringify(supplierData),
      });
      await loadWorkspace(token, user);
      setNewSupplier({ name: "", firstName: "", lastName: "", email: "", phone: "" });
      setEditingSupplier(null);
      setMessage({ type: "success", text: editingSupplier ? "Supplier updated." : "Supplier saved." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function createSample(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/samples", token, {
        method: "POST",
        body: JSON.stringify({
          reference: newReference.reference,
          supplierId: newReference.supplierId,
          supplierName: newReference.supplierName,
        }),
      });
      await loadWorkspace(token, user);
      setNewReference({ reference: "", supplierId: "", supplierName: "", supplierSelection: "" });
      setMessage({ type: "success", text: "Reference created and assigned." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveFollowup(event) {
    event.preventDefault();
    if (!selectedSample) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api(`/api/samples/${selectedSample.id}`, token, {
        method: "PATCH",
        body: JSON.stringify(followup),
      });
      setSamples((current) => current.map((sample) => sample.id === result.sample.id ? { ...sample, ...result.sample } : sample));
      setMessage({ type: "success", text: "Tracking details saved." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveManagerSample(sampleId, changes) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api(`/api/manager/samples/${sampleId}`, token, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setSamples((current) => current.map((sample) => sample.id === result.sample.id ? result.sample : sample));
      setMessage({ type: "success", text: "Reference updated." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSample(sample) {
    if (!window.confirm(`Delete reference ${sample.reference}? It will remain available in the archive.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/samples/${sample.id}`, token, { method: "DELETE" });
      await loadWorkspace(token, user);
      setMessage({ type: "success", text: "Reference moved to the archive." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  const manager = user?.role === "manager";
  const completedCount = samples.filter((sample) =>
    sample.dateDemande && sample.disponible && sample.dateEnvoi && sample.dateReception
    && (sample.disponible !== "NO" || sample.dateDisponibilite)
    && (sample.renvoye !== "YES" || sample.dateRenvoi)
  ).length;

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-art" aria-label="Supplier sample tracking">
          <div className="art-top"><Boxes size={22} /><span>OPERATIONS / SAMPLE DESK</span></div>
          <div className="art-copy">
            <p className="eyebrow">Supplier sample tracking</p>
            <h1>Every sample,<br />in the right place.</h1>
            <p>References, availability and delivery in one shared tracking space.</p>
          </div>
          <div className="art-index"><span>01 / 03</span><span>REFERENCE · SHIPMENT · RETURN</span></div>
        </section>
        <section className="login-panel">
          <div className="login-inner">
            <div className="brand-mark"><Factory size={20} /></div>
            <p className="eyebrow">SECURE WORKSPACE</p>
            <h2>{showRegistration ? "Create an account" : "Sign in"}</h2>
            <p className="muted">{showRegistration ? "Create your account to track supplier samples." : "Sign in to your supplier tracking workspace."}</p>
            {message && <Message message={message} />}
            {showRegistration ? (
              <form className="stack-form" onSubmit={submitRegistration}>
                <div className="field-grid">
                  <label className="form-field">First name<input autoComplete="given-name" maxLength={100} value={registration.firstName} onChange={(event) => setRegistration({ ...registration, firstName: event.target.value })} required /></label>
                  <label className="form-field">Last name<input autoComplete="family-name" maxLength={100} value={registration.lastName} onChange={(event) => setRegistration({ ...registration, lastName: event.target.value })} required /></label>
                </div>
                <label>Email address<input type="email" autoComplete="email" maxLength={254} value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} required /></label>
                <label>Password<input type="password" autoComplete="new-password" minLength={12} value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} required /><small>At least 12 characters</small></label>
                <label>Account type<select value={registration.accountType} onChange={(event) => setRegistration({ ...registration, accountType: event.target.value })}><option value="supplier">Supplier</option><option value="referrer">Lacoste contact</option></select></label>
                {registration.accountType === "supplier" ? (
                  <>
                    <label>Company name<input autoComplete="organization" maxLength={150} value={registration.company} onChange={(event) => setRegistration({ ...registration, company: event.target.value })} required /></label>
                    <label>International phone number<input type="tel" autoComplete="tel" placeholder="+33 6 12 34 56 78" maxLength={30} value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} required /></label>
                  </>
                ) : (
                  <>
                    <label>Job title<input autoComplete="organization-title" maxLength={120} value={registration.jobTitle} onChange={(event) => setRegistration({ ...registration, jobTitle: event.target.value })} required /></label>
                    <p className="login-note">Company: Lacoste</p>
                  </>
                )}
                <button className="button button-dark button-wide" disabled={busy}>{busy ? "Creating…" : "Create account"}<ArrowUpRight size={17} /></button>
              </form>
            ) : (
              <form className="stack-form" onSubmit={submitLogin}>
                <label>Email address<input type="email" autoComplete="username" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} required /></label>
                <label>Password<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required /></label>
                <button className="button button-dark button-wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowUpRight size={17} /></button>
              </form>
            )}
            <button className="login-switch" type="button" onClick={() => { setShowRegistration(!showRegistration); setMessage(null); }}>
              {showRegistration ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
            <p className="login-foot"><ShieldCheck size={15} /> Access is restricted to authorised accounts</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top"><span className="brand-mark"><Boxes size={20} /></span><span>sample<span className="brand-light">desk</span></span></a>
        <div className="side-label">WORKSPACE</div>
        <button type="button" className={`nav-item ${activeView !== "fournisseurs" ? "active" : ""}`} onClick={() => setActiveView("suivi")}>
          <Boxes size={17} /> Samples <span className="nav-count">{samples.length}</span>
        </button>
        {manager && (
          <button type="button" className={`nav-item ${activeView === "fournisseurs" ? "active" : ""}`} onClick={() => setActiveView("fournisseurs")}>
            <Users size={17} /> Suppliers <span className="nav-count">{suppliers.length}</span>
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="account-card"><span className="avatar">{(user.firstName || user.email).slice(0, 1).toUpperCase()}</span><span className="account-name"><strong>{[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}</strong><small>{manager ? `Manager · ${user.jobTitle || "Lacoste"}` : `Supplier · ${user.company || user.email}`}</small></span></div>
          <button className="signout" onClick={signOut}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="page-header">
          <div><p className="eyebrow">{manager ? "SAMPLE MANAGEMENT" : "SUPPLIER PORTAL"}</p><h1>{manager && activeView === "historique" ? "Sample archive" : manager && activeView === "fournisseurs" ? "Suppliers" : "Sample tracking"}</h1></div>
          <div className="header-right"><span className="connection"><span /> Connected</span><span className="header-date">{new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date())}</span></div>
        </header>
        {manager && activeView !== "fournisseurs" && (
          <nav className="view-tabs" aria-label="Tracking pages">
            <button type="button" className={activeView === "suivi" ? "active" : ""} onClick={() => setActiveView("suivi")}>OVERVIEW</button>
            <button type="button" className={activeView === "historique" ? "active" : ""} onClick={() => setActiveView("historique")}>
              ARCHIVE <span>{historySamples.length}</span>
            </button>
          </nav>
        )}
        {message && <Message message={message} />}

        {manager ? (
          activeView === "fournisseurs" ? (
            <SupplierDirectory
              suppliers={suppliers}
              newSupplier={newSupplier}
              setNewSupplier={setNewSupplier}
              editingSupplier={editingSupplier}
              setEditingSupplier={setEditingSupplier}
              saveSupplier={saveSupplier}
              busy={busy}
            />
          ) : activeView === "historique" ? (
            <section className="manager-page">
              <div className="section-heading"><div><p className="eyebrow">ARCHIVE</p><h2>Archived references</h2></div><span className="result-count">{historySamples.length} total</span></div>
              {historySamples.length === 0 ? <EmptyState text="No archived references." /> : (
                <SampleTable rows={historySamples} suppliers={suppliers} history filters={historyFilters} setFilters={setHistoryFilters} />
              )}
            </section>
          ) : (
            <>
              <section className="summary-row">
                <Summary icon={<Boxes size={18} />} label="References" value={samples.length} tone="mint" />
                <Summary icon={<Check size={18} />} label="Tracking completed" value={completedCount} tone="yellow" />
                <Summary icon={<Users size={18} />} label="Suppliers" value={suppliers.length} tone="coral" />
              </section>
              <section className="workspace-grid manager-overview">
                <div className="primary-column">
                  <div className="section-heading"><div><p className="eyebrow">GENERAL VIEW</p><h2>Saved references</h2></div><span className="result-count">{samples.length} total</span></div>
                  {samples.length === 0 ? <EmptyState text="No references have been saved yet." /> : (
                    <SampleTable
                      rows={samples}
                      suppliers={suppliers}
                      filters={sampleFilters}
                      setFilters={setSampleFilters}
                      onSave={saveManagerSample}
                      onDelete={deleteSample}
                      busy={busy}
                    />
                  )}
                </div>
                <aside className="forms-column">
                  <section className="form-panel new-reference-panel">
                    <div className="panel-title"><span className="panel-icon yellow"><PackagePlus size={18} /></span><div><h3>Create a reference</h3><p>Assign a sample to a supplier</p></div></div>
                    <form className="stack-form compact" onSubmit={createSample}>
                      <label>Reference<input value={newReference.reference} onChange={(event) => setNewReference({ ...newReference, reference: event.target.value })} placeholder="e.g. SAMPLE-002" maxLength={100} required /></label>
                      <label>Supplier
                        <select
                          value={newReference.supplierSelection}
                          onChange={(event) => {
                            const selection = event.target.value;
                            if (selection.startsWith("named:")) {
                              setNewReference({ ...newReference, supplierId: "", supplierName: selection.slice(6), supplierSelection: selection });
                            } else {
                              setNewReference({ ...newReference, supplierId: selection.startsWith("account:") ? selection.slice(8) : "", supplierName: "", supplierSelection: selection });
                            }
                          }}
                        >
                          <option value="">Unassigned</option>
                          {suppliers.map((supplier) => supplier.kind === "account" ? (
                            <option key={`account:${supplier.id}`} value={`account:${supplier.id}`}>
                              {supplier.company ? `${supplier.company} — ` : ""}{supplier.email}
                            </option>
                          ) : (
                            <option key={`named:${supplier.id}`} value={`named:${supplier.name}`}>{supplier.name}</option>
                          ))}
                        </select>
                      </label>
                      <button className="button button-dark" disabled={busy}><Plus size={16} /> {busy ? "Creating…" : "Save reference"}</button>
                    </form>
                  </section>
                </aside>
              </section>
            </>
          )
        ) : (
          <SupplierWorkspace samples={samples} selectedId={selectedId} setSelectedId={setSelectedId} selectedSample={selectedSample} followup={followup} setFollowup={setFollowup} saveFollowup={saveFollowup} busy={busy} />
        )}
        <footer className="page-footer"><span>Sample Desk · Supplier tracking</span><span><CircleHelp size={14} /> Changes are saved to the shared database.</span></footer>
      </main>
    </div>
  );
}

const tableColumns = [
  { key: "reference", label: "REFERENCE" },
  { key: "supplier", label: "SUPPLIER" },
  { key: "demande", label: "REQUESTED" },
  { key: "disponibilite", label: "AVAILABILITY" },
  { key: "envoi", label: "SENT" },
  { key: "reception", label: "RECEIVED" },
  { key: "renvoi", label: "RETURNED" },
];

function filterValue(sample, key) {
  switch (key) {
    case "reference": return sample.reference;
    case "supplier": return sample.supplierName || sample.supplierEmail || "Unassigned";
    case "demande": return dateLabel(sample.dateDemande);
    case "disponibilite": return sample.disponible || "Not set";
    case "envoi": return dateLabel(sample.dateEnvoi);
    case "reception": return dateLabel(sample.dateReception);
    case "renvoi": return sample.renvoye || "NO";
    case "archive": return dateTimeLabel(sample.deletedAt);
    default: return "";
  }
}

function SampleTable({ rows, suppliers, history = false, filters, setFilters, onSave, onDelete, busy = false }) {
  const columns = history ? [...tableColumns, { key: "archive", label: "ARCHIVED ON" }] : tableColumns;
  const options = Object.fromEntries(columns.map(({ key }) => [
    key,
    [...new Set(rows.map((sample) => filterValue(sample, key)))].sort((a, b) => a.localeCompare(b, "en")),
  ]));
  const visibleRows = rows.filter((sample) => columns.every(({ key }) => {
    const selected = filters[key];
    return selected === undefined || selected.includes(filterValue(sample, key));
  }));

  return (
    <div className="sample-table">
      <div className={`table-head ${history ? "history-table" : ""}`}>
        {columns.map(({ key, label }) => (
          <div className="table-heading" key={key}>
            <span>{label}</span>
            <ColumnFilter
              label={label}
              values={options[key]}
              selected={filters[key]}
              onChange={(selected) => setFilters((current) => {
                const next = { ...current };
                if (selected === undefined) delete next[key];
                else next[key] = selected;
                return next;
              })}
            />
          </div>
        ))}
        {!history && <span className="row-actions-heading">ACTIONS</span>}
      </div>
      {visibleRows.length === 0 ? (
        <div className="table-empty">No references match the selected filters.</div>
      ) : visibleRows.map((sample) => history ? (
        <div className="table-row history-table" key={sample.id}>
          <div className="table-cell" data-label="Reference"><strong className="ref-cell">{sample.reference}</strong></div>
          <div className="table-cell" data-label="Supplier">{sample.supplierName || sample.supplierEmail || <em>Unassigned</em>}</div>
          <div className="table-cell" data-label="Requested">{dateLabel(sample.dateDemande)}</div>
          <div className="table-cell status-detail" data-label="Availability"><Status value={sample.disponible} />{sample.disponible === "NO" && sample.dateDisponibilite && <small>Expected · {dateLabel(sample.dateDisponibilite)}</small>}</div>
          <div className="table-cell" data-label="Sent">{dateLabel(sample.dateEnvoi)}</div>
          <div className="table-cell" data-label="Received">{dateLabel(sample.dateReception)}</div>
          <div className="table-cell status-detail" data-label="Returned"><Status value={sample.renvoye} />{sample.renvoye === "YES" && sample.dateRenvoi && <small>{dateLabel(sample.dateRenvoi)}</small>}</div>
          <div className="table-cell" data-label="Archived on">{filterValue(sample, "archive")}</div>
        </div>
      ) : (
        <ManagerSampleRow key={sample.id} sample={sample} suppliers={suppliers} onSave={onSave} onDelete={onDelete} busy={busy} />
      ))}
    </div>
  );
}

function ColumnFilter({ label, values, selected, onChange }) {
  const checkedValues = selected === undefined ? values : selected;

  function toggle(value) {
    const current = new Set(checkedValues);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    onChange([...current]);
  }

  return (
    <details className={`column-filter ${selected === undefined ? "" : "filtered"}`}>
      <summary aria-label={`Filtrer ${label}`} title={`Filtrer ${label}`}><ListFilter size={13} /></summary>
      <div className="filter-menu">
        <button type="button" className="filter-clear" onClick={() => onChange(undefined)}>Show all</button>
        {values.map((value) => (
          <label key={value}>
            <input type="checkbox" checked={checkedValues.includes(value)} onChange={() => toggle(value)} />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function createManagerSampleDraft(sample) {
  const supplierSelection = sample.supplierId
    ? `account:${sample.supplierId}`
    : sample.supplierName ? `named:${sample.supplierName}` : "";
  return {
    supplierSelection,
    dateDemande: sample.dateDemande || "",
    disponible: sample.disponible || "",
    dateDisponibilite: sample.dateDisponibilite || "",
    dateEnvoi: sample.dateEnvoi || "",
    dateReception: sample.dateReception || "",
    renvoye: sample.renvoye || "NO",
    dateRenvoi: sample.dateRenvoi || "",
  };
}

function ManagerSampleRow({ sample, suppliers, onSave, onDelete, busy }) {
  const [draft, setDraft] = useState(() => createManagerSampleDraft(sample));

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const selection = draft.supplierSelection || "";
    const account = selection.startsWith("account:");
    onSave(sample.id, {
      supplierId: account ? selection.slice(8) : null,
      supplierName: selection.startsWith("named:") ? selection.slice(6) : null,
      dateDemande: draft.dateDemande,
      disponible: draft.disponible,
      dateDisponibilite: draft.dateDisponibilite,
      dateEnvoi: draft.dateEnvoi,
      dateReception: draft.dateReception,
      renvoye: draft.renvoye,
      dateRenvoi: draft.dateRenvoi,
    });
  }

  return (
    <form className="table-row editable-row" onSubmit={submit}>
      <div className="table-cell" data-label="Reference"><strong className="ref-cell">{sample.reference}</strong></div>
      <div className="table-cell" data-label="Supplier">
        <select aria-label={`Supplier for ${sample.reference}`} value={draft.supplierSelection || ""} onChange={(event) => update("supplierSelection", event.target.value)}>
          <option value="">Unassigned</option>
          {suppliers.map((supplier) => supplier.kind === "account" ? (
            <option key={`account:${supplier.id}`} value={`account:${supplier.id}`}>
              {supplier.company ? `${supplier.company} — ` : ""}{supplier.email}
            </option>
          ) : (
            <option key={`named:${supplier.id}`} value={`named:${supplier.name}`}>{supplier.name}</option>
          ))}
        </select>
      </div>
      <div className="table-cell" data-label="Requested"><input aria-label={`Request date for ${sample.reference}`} type="date" value={draft.dateDemande || ""} onChange={(event) => update("dateDemande", event.target.value)} /></div>
      <div className="table-cell row-control-group" data-label="Availability">
        <select aria-label={`Availability for ${sample.reference}`} value={draft.disponible || ""} onChange={(event) => update("disponible", event.target.value)}>
          <option value="">Not set</option><option value="YES">YES</option><option value="NO">NO</option>
        </select>
        {draft.disponible === "NO" && <input aria-label={`Expected availability date for ${sample.reference}`} type="date" value={draft.dateDisponibilite || ""} onChange={(event) => update("dateDisponibilite", event.target.value)} required />}
      </div>
      <div className="table-cell" data-label="Sent"><input aria-label={`Shipment date for ${sample.reference}`} type="date" value={draft.dateEnvoi || ""} onChange={(event) => update("dateEnvoi", event.target.value)} /></div>
      <div className="table-cell" data-label="Received"><input aria-label={`Receipt date for ${sample.reference}`} type="date" value={draft.dateReception || ""} onChange={(event) => update("dateReception", event.target.value)} /></div>
      <div className="table-cell row-control-group" data-label="Returned">
        <select aria-label={`Return status for ${sample.reference}`} value={draft.renvoye || "NO"} onChange={(event) => update("renvoye", event.target.value)}>
          <option value="NO">NO</option><option value="YES">YES</option>
        </select>
        {draft.renvoye === "YES" && <input aria-label={`Return date for ${sample.reference}`} type="date" value={draft.dateRenvoi || ""} onChange={(event) => update("dateRenvoi", event.target.value)} required />}
      </div>
      <div className="table-cell row-actions" data-label="Actions">
        <button className="icon-button save-icon" type="submit" aria-label={`Save ${sample.reference}`} title="Save" disabled={busy}><Save size={15} /></button>
        <button className="icon-button delete-icon" type="button" aria-label={`Delete ${sample.reference}`} title="Delete" onClick={() => onDelete(sample)} disabled={busy}><Trash2 size={15} /></button>
      </div>
    </form>
  );
}

function SupplierDirectory({ suppliers, newSupplier, setNewSupplier, editingSupplier, setEditingSupplier, saveSupplier, busy }) {
  function editSupplier(supplier) {
    setEditingSupplier(supplier);
    setNewSupplier({
      name: supplier.name || supplier.company || "",
      firstName: supplier.first_name || "",
      lastName: supplier.last_name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
    });
  }

  function cancelEdit() {
    setEditingSupplier(null);
    setNewSupplier({ name: "", firstName: "", lastName: "", email: "", phone: "" });
  }

  return (
    <section className="supplier-directory-page">
      <div className="section-heading">
        <div><p className="eyebrow">DIRECTORY</p><h2>Suppliers</h2></div>
        <span className="result-count">{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}</span>
      </div>
      <div className="supplier-directory-grid">
        <section className="form-panel supplier-entry-panel">
          <div className="panel-title"><span className="panel-icon mint">{editingSupplier ? <Pencil size={18} /> : <Plus size={18} />}</span><div><h3>{editingSupplier ? "Edit supplier" : "Add a supplier"}</h3><p>{editingSupplier ? "Update supplier contact details" : "Add contact details to the directory"}</p></div></div>
          <form className="stack-form compact" onSubmit={saveSupplier}>
            <label>Supplier / company name<input autoComplete="organization" maxLength={150} value={newSupplier.name} onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })} required /></label>
            <div className="field-grid">
              <label className="form-field">Contact first name<input autoComplete="given-name" maxLength={100} value={newSupplier.firstName} onChange={(event) => setNewSupplier({ ...newSupplier, firstName: event.target.value })} required /></label>
              <label className="form-field">Contact last name<input autoComplete="family-name" maxLength={100} value={newSupplier.lastName} onChange={(event) => setNewSupplier({ ...newSupplier, lastName: event.target.value })} required /></label>
            </div>
            <label>Email address<input type="email" autoComplete="email" maxLength={254} value={newSupplier.email} onChange={(event) => setNewSupplier({ ...newSupplier, email: event.target.value })} required /></label>
            <label>International phone number<input type="tel" autoComplete="tel" placeholder="+33 6 12 34 56 78" maxLength={30} value={newSupplier.phone} onChange={(event) => setNewSupplier({ ...newSupplier, phone: event.target.value })} required /><small>Include the international calling code, for example +33.</small></label>
            <button className="button button-dark" disabled={busy}>{editingSupplier ? <Save size={16} /> : <Plus size={16} />} {busy ? "Saving…" : editingSupplier ? "Save changes" : "Save supplier"}</button>
            {editingSupplier && <button className="button supplier-cancel-button" type="button" onClick={cancelEdit} disabled={busy}>Cancel</button>}
          </form>
        </section>
        <div className="supplier-directory-list">
          {suppliers.length === 0 ? <EmptyState text="No suppliers in the directory." /> : suppliers.map((supplier) => (
            <article className="supplier-contact-card" key={`${supplier.kind}:${supplier.id}`}>
              <span className="sample-icon"><Users size={17} /></span>
              <div className="supplier-contact-info">
                <strong>{supplier.name || supplier.company || "Unnamed supplier"}</strong>
                <span>{[supplier.first_name, supplier.last_name].filter(Boolean).join(" ") || "Contact details not provided"}</span>
                {supplier.email && <a href={`mailto:${supplier.email}`}>{supplier.email}</a>}
                {supplier.phone && <a href={`tel:${supplier.phone}`}>{supplier.phone}</a>}
              </div>
              <button className="icon-button supplier-edit-button" type="button" aria-label={`Edit ${supplier.name || supplier.company || supplier.email}`} title="Edit" onClick={() => editSupplier(supplier)} disabled={busy}>
                <Pencil size={15} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SupplierWorkspace({ samples, selectedId, setSelectedId, selectedSample, followup, setFollowup, saveFollowup, busy }) {
  return (
    <section className="supplier-workspace">
      <div className="section-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>My samples</h2></div><span className="result-count">{samples.length} reference{samples.length === 1 ? "" : "s"}</span></div>
      {samples.length === 0 ? <EmptyState text="No samples have been assigned to you yet. Please contact your manager." /> : (
        <div className="supplier-grid">
          <div className="supplier-list">
            {samples.map((sample) => <button key={sample.id} className={`supplier-sample ${String(sample.id) === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(String(sample.id))}>
              <span className="sample-icon"><Boxes size={17} /></span><span className="sample-copy"><strong>{sample.reference}</strong><small>{sample.dateDemande ? `Requested · ${dateLabel(sample.dateDemande)}` : "Details to be completed"}</small></span><span className="sample-arrow">›</span>
            </button>)}
          </div>
          {selectedSample && <form className="form-panel followup-panel" onSubmit={saveFollowup}>
            <div className="followup-heading"><div><p className="eyebrow">SAMPLE DETAILS</p><h2>{selectedSample.reference}</h2></div><span className="status-tag">{selectedSample.dateReception ? "Received" : "In progress"}</span></div>
            <div className="field-grid">
              <DateField label="Sample request date" value={followup.dateDemande} onChange={(value) => setFollowup({ ...followup, dateDemande: value })} />
              <label className="form-field">Availability<select value={followup.disponible} onChange={(event) => setFollowup({ ...followup, disponible: event.target.value, dateDisponibilite: event.target.value === "NO" ? followup.dateDisponibilite : "" })}><option value="">Not set</option><option value="YES">YES</option><option value="NO">NO</option></select></label>
              {followup.disponible === "NO" && <DateField label="Expected availability date" value={followup.dateDisponibilite} onChange={(value) => setFollowup({ ...followup, dateDisponibilite: value })} required />}
              <DateField label="Sample shipment date" value={followup.dateEnvoi} onChange={(value) => setFollowup({ ...followup, dateEnvoi: value })} />
              <DateField label="Sample receipt date" value={followup.dateReception} onChange={(value) => setFollowup({ ...followup, dateReception: value })} />
              <label className="form-field">Has the sample been returned?<select value={followup.renvoye} onChange={(event) => setFollowup({ ...followup, renvoye: event.target.value, dateRenvoi: event.target.value === "YES" ? followup.dateRenvoi : "" })}><option value="NO">NO</option><option value="YES">YES</option></select></label>
              {followup.renvoye === "YES" && <DateField label="Return date" value={followup.dateRenvoi} onChange={(value) => setFollowup({ ...followup, dateRenvoi: value })} required />}
            </div>
            <div className="save-row"><span><ShieldCheck size={15} /> Your updates are shared with the manager</span><button className="button button-dark" disabled={busy}><Save size={16} /> {busy ? "Saving…" : "Save updates"}</button></div>
          </form>}
        </div>
      )}
    </section>
  );
}

function DateField({ label, value, onChange, required = false }) {
  return <label className="form-field">{label}<input type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function Summary({ icon, label, value, tone }) {
  return <div className="summary-card"><span className={`summary-icon ${tone}`}>{icon}</span><span className="summary-copy"><small>{label}</small><strong>{value}</strong></span><span className="summary-rule" /></div>;
}

function Status({ value }) {
  if (!value) return <span className="status-pill neutral">Not set</span>;
  return <span className={`status-pill ${value === "YES" ? "positive" : "negative"}`}><span />{value}</span>;
}

function EmptyState({ text }) {
  return <div className="empty-state"><span><PackagePlus size={20} /></span><p>{text}</p></div>;
}

function Message({ message }) {
  return <div className={`message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}{message.text}</div>;
}

export default App;
