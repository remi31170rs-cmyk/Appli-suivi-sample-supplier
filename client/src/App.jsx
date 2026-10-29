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
  if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");
  return result;
}

function dateLabel(value) {
  if (!value) return "À compléter";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
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
    jobTitle: "",
  });
  const [showRegistration, setShowRegistration] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ email: "", password: "" });
  const [newSupplierName, setNewSupplierName] = useState("");
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
      setMessage({ type: "success", text: "Connexion réussie." });
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
      setMessage({ type: "success", text: "Compte créé. Bienvenue !" });
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

  async function createSupplier(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/users/suppliers", token, {
        method: "POST",
        body: JSON.stringify(newSupplier),
      });
      const { suppliers: supplierRows } = await api("/api/users/suppliers", token);
      setSuppliers(supplierRows);
      setNewSupplier({ email: "", password: "" });
      setMessage({ type: "success", text: "Compte fournisseur créé." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function createSupplierName(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/suppliers/directory", token, {
        method: "POST",
        body: JSON.stringify({ name: newSupplierName }),
      });
      const { suppliers: supplierRows } = await api("/api/users/suppliers", token);
      setSuppliers(supplierRows);
      setNewSupplierName("");
      setMessage({ type: "success", text: "Fournisseur ajouté à la liste." });
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
      setMessage({ type: "success", text: "Référence créée et attribuée." });
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
      setMessage({ type: "success", text: "Suivi enregistré." });
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
      setMessage({ type: "success", text: "Ligne mise à jour." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSample(sample) {
    if (!window.confirm(`Supprimer la référence ${sample.reference} ? Elle restera consultable dans l'historique.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/samples/${sample.id}`, token, { method: "DELETE" });
      await loadWorkspace(token, user);
      setMessage({ type: "success", text: "Référence déplacée dans l'historique." });
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
        <section className="login-art" aria-label="Suivi des envois fournisseurs">
          <div className="art-top"><Boxes size={22} /><span>OPERATIONS / SAMPLE DESK</span></div>
          <div className="art-copy">
            <p className="eyebrow">Supplier sample tracking</p>
            <h1>Chaque sample,<br />au bon endroit.</h1>
            <p>Références, disponibilité et acheminement réunis dans un seul suivi partagé.</p>
          </div>
          <div className="art-index"><span>01 / 03</span><span>REFERENCE · SHIPMENT · RETURN</span></div>
        </section>
        <section className="login-panel">
          <div className="login-inner">
            <div className="brand-mark"><Factory size={20} /></div>
            <p className="eyebrow">Espace sécurisé</p>
            <h2>{showRegistration ? "Créer un compte" : "Connexion"}</h2>
            <p className="muted">{showRegistration ? "Créez votre accès au suivi des échantillons." : "Connectez-vous à votre espace de suivi fournisseur."}</p>
            {message && <Message message={message} />}
            {showRegistration ? (
              <form className="stack-form" onSubmit={submitRegistration}>
                <div className="field-grid">
                  <label className="form-field">Prénom<input autoComplete="given-name" maxLength={100} value={registration.firstName} onChange={(event) => setRegistration({ ...registration, firstName: event.target.value })} required /></label>
                  <label className="form-field">Nom<input autoComplete="family-name" maxLength={100} value={registration.lastName} onChange={(event) => setRegistration({ ...registration, lastName: event.target.value })} required /></label>
                </div>
                <label>Adresse e-mail<input type="email" autoComplete="email" maxLength={254} value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} required /></label>
                <label>Mot de passe<input type="password" autoComplete="new-password" minLength={12} value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} required /><small>12 caractères minimum</small></label>
                <label>Type de compte<select value={registration.accountType} onChange={(event) => setRegistration({ ...registration, accountType: event.target.value })}><option value="supplier">Fournisseur</option><option value="referrer">Référant Lacoste</option></select></label>
                {registration.accountType === "supplier" ? (
                  <label>Nom de l’entreprise<input autoComplete="organization" maxLength={150} value={registration.company} onChange={(event) => setRegistration({ ...registration, company: event.target.value })} required /></label>
                ) : (
                  <>
                    <label>Poste occupé<input autoComplete="organization-title" maxLength={120} value={registration.jobTitle} onChange={(event) => setRegistration({ ...registration, jobTitle: event.target.value })} required /></label>
                    <p className="login-note">Entreprise : Lacoste</p>
                  </>
                )}
                <button className="button button-dark button-wide" disabled={busy}>{busy ? "Création…" : "Créer mon compte"}<ArrowUpRight size={17} /></button>
              </form>
            ) : (
              <form className="stack-form" onSubmit={submitLogin}>
                <label>Adresse e-mail<input type="email" autoComplete="username" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} required /></label>
                <label>Mot de passe<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required /></label>
                <button className="button button-dark button-wide" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}<ArrowUpRight size={17} /></button>
              </form>
            )}
            <button className="login-switch" type="button" onClick={() => { setShowRegistration(!showRegistration); setMessage(null); }}>
              {showRegistration ? "Vous avez déjà un compte ? Se connecter" : "Pas encore de compte ? Créer un compte"}
            </button>
            <p className="login-foot"><ShieldCheck size={15} /> Accès réservé aux comptes autorisés</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top"><span className="brand-mark"><Boxes size={20} /></span><span>sample<span className="brand-light">desk</span></span></a>
        <div className="side-label">ESPACE</div>
        <div className="nav-item active"><Boxes size={17} /> Échantillons <span className="nav-count">{samples.length}</span></div>
        {manager && <div className="nav-item"><Users size={17} /> Fournisseurs <span className="nav-count">{suppliers.length}</span></div>}
        <div className="sidebar-bottom">
          <div className="account-card"><span className="avatar">{(user.firstName || user.email).slice(0, 1).toUpperCase()}</span><span className="account-name"><strong>{[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}</strong><small>{manager ? `Référant · ${user.jobTitle || "Lacoste"}` : `Fournisseur · ${user.company || user.email}`}</small></span></div>
          <button className="signout" onClick={signOut}><LogOut size={16} /> Déconnexion</button>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="page-header">
          <div><p className="eyebrow">{manager ? "GESTION FOURNISSEURS" : "PORTAIL FOURNISSEUR"}</p><h1>{manager && activeView === "historique" ? "Historique des échantillons" : "Suivi des échantillons"}</h1></div>
          <div className="header-right"><span className="connection"><span /> Connecté</span><span className="header-date">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}</span></div>
        </header>
        {manager && (
          <nav className="view-tabs" aria-label="Pages de suivi">
            <button type="button" className={activeView === "suivi" ? "active" : ""} onClick={() => setActiveView("suivi")}>SUIVI</button>
            <button type="button" className={activeView === "historique" ? "active" : ""} onClick={() => setActiveView("historique")}>
              HISTORIQUE <span>{historySamples.length}</span>
            </button>
          </nav>
        )}
        {message && <Message message={message} />}

        {manager ? (
          activeView === "historique" ? (
            <section className="manager-page">
              <div className="section-heading"><div><p className="eyebrow">ARCHIVES</p><h2>Références supprimées</h2></div><span className="result-count">{historySamples.length} au total</span></div>
              {historySamples.length === 0 ? <EmptyState text="Aucune référence supprimée." /> : (
                <SampleTable rows={historySamples} suppliers={suppliers} history filters={historyFilters} setFilters={setHistoryFilters} />
              )}
            </section>
          ) : (
            <>
              <section className="summary-row">
                <Summary icon={<Boxes size={18} />} label="Références" value={samples.length} tone="mint" />
                <Summary icon={<Check size={18} />} label="Suivis renseignés" value={completedCount} tone="yellow" />
                <Summary icon={<Users size={18} />} label="Fournisseurs" value={suppliers.length} tone="coral" />
              </section>
              <section className="workspace-grid">
                <div className="primary-column">
                  <div className="section-heading"><div><p className="eyebrow">VUE GÉNÉRALE</p><h2>Références récentes</h2></div><span className="result-count">{samples.length} au total</span></div>
                  {samples.length === 0 ? <EmptyState text="Aucune référence pour le moment." /> : (
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
                  <section className="form-panel">
                    <div className="panel-title"><span className="panel-icon mint"><Users size={18} /></span><div><h3>Ajouter à la liste fournisseur</h3><p>Sans créer de référence ni de compte</p></div></div>
                    <form className="stack-form compact" onSubmit={createSupplierName}>
                      <label>Nom du fournisseur<input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} maxLength={150} required /></label>
                      <button className="button button-dark" disabled={busy}><Plus size={16} /> Ajouter à la liste</button>
                    </form>
                  </section>
                  <section className="form-panel">
                    <div className="panel-title"><span className="panel-icon mint"><Users size={18} /></span><div><h3>Créer un accès fournisseur</h3><p>Créer un compte de connexion sécurisé</p></div></div>
                    <form className="stack-form compact" onSubmit={createSupplier}>
                      <label>Adresse e-mail<input type="email" value={newSupplier.email} onChange={(event) => setNewSupplier({ ...newSupplier, email: event.target.value })} required /></label>
                      <label>Mot de passe temporaire<input type="password" minLength={12} value={newSupplier.password} onChange={(event) => setNewSupplier({ ...newSupplier, password: event.target.value })} required /><small>12 caractères minimum</small></label>
                      <button className="button button-dark" disabled={busy}><Plus size={16} /> Créer le compte</button>
                    </form>
                  </section>
                  <section className="form-panel">
                    <div className="panel-title"><span className="panel-icon yellow"><PackagePlus size={18} /></span><div><h3>Nouvelle référence</h3><p>Attribuer le sample à un fournisseur</p></div></div>
                    <form className="stack-form compact" onSubmit={createSample}>
                      <label>Référence<input value={newReference.reference} onChange={(event) => setNewReference({ ...newReference, reference: event.target.value })} placeholder="Ex. SAMPLE-002" maxLength={100} required /></label>
                      <label>Fournisseur
                        <select
                          value={newReference.supplierSelection}
                          onChange={(event) => {
                            const selection = event.target.value;
                            if (selection === "__new__") {
                              setNewReference({ ...newReference, supplierId: "", supplierName: "", supplierSelection: selection });
                            } else if (selection.startsWith("named:")) {
                              setNewReference({ ...newReference, supplierId: "", supplierName: selection.slice(6), supplierSelection: selection });
                            } else {
                              setNewReference({ ...newReference, supplierId: selection.startsWith("account:") ? selection.slice(8) : "", supplierName: "", supplierSelection: selection });
                            }
                          }}
                        >
                          <option value="">Non attribué</option>
                          {suppliers.map((supplier) => supplier.id ? (
                            <option key={`account:${supplier.id}`} value={`account:${supplier.id}`}>
                              {supplier.company ? `${supplier.company} — ` : ""}{supplier.email}
                            </option>
                          ) : (
                            <option key={`named:${supplier.name}`} value={`named:${supplier.name}`}>{supplier.name}</option>
                          ))}
                          <option value="__new__">+ Ajouter un fournisseur</option>
                        </select>
                      </label>
                      {newReference.supplierSelection === "__new__" && (
                        <label>Nom du fournisseur
                          <input
                            value={newReference.supplierName}
                            onChange={(event) => setNewReference({ ...newReference, supplierName: event.target.value })}
                            maxLength={150}
                            required
                          />
                        </label>
                      )}
                      <button className="button button-dark" disabled={busy}><Plus size={16} /> Créer la référence</button>
                    </form>
                  </section>
                </aside>
              </section>
            </>
          )
        ) : (
          <SupplierWorkspace samples={samples} selectedId={selectedId} setSelectedId={setSelectedId} selectedSample={selectedSample} followup={followup} setFollowup={setFollowup} saveFollowup={saveFollowup} busy={busy} />
        )}
        <footer className="page-footer"><span>Sample Desk · Suivi fournisseurs</span><span><CircleHelp size={14} /> Les modifications sont enregistrées dans la base partagée.</span></footer>
      </main>
    </div>
  );
}

const tableColumns = [
  { key: "reference", label: "RÉFÉRENCE" },
  { key: "supplier", label: "FOURNISSEUR" },
  { key: "demande", label: "DEMANDE" },
  { key: "disponibilite", label: "DISPONIBILITÉ" },
  { key: "envoi", label: "ENVOI" },
  { key: "reception", label: "RÉCEPTION" },
  { key: "renvoi", label: "RENVOI" },
];

function filterValue(sample, key) {
  switch (key) {
    case "reference": return sample.reference;
    case "supplier": return sample.supplierName || sample.supplierEmail || "Non attribué";
    case "demande": return dateLabel(sample.dateDemande);
    case "disponibilite": return sample.disponible || "À renseigner";
    case "envoi": return dateLabel(sample.dateEnvoi);
    case "reception": return dateLabel(sample.dateReception);
    case "renvoi": return sample.renvoye || "NO";
    case "archive": return sample.deletedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sample.deletedAt)) : "Inconnu";
    default: return "";
  }
}

function SampleTable({ rows, suppliers, history = false, filters, setFilters, onSave, onDelete, busy = false }) {
  const columns = history ? [...tableColumns, { key: "archive", label: "SUPPRIMÉE LE" }] : tableColumns;
  const options = Object.fromEntries(columns.map(({ key }) => [
    key,
    [...new Set(rows.map((sample) => filterValue(sample, key)))].sort((a, b) => a.localeCompare(b, "fr")),
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
        <div className="table-empty">Aucune ligne ne correspond aux filtres.</div>
      ) : visibleRows.map((sample) => history ? (
        <div className="table-row history-table" key={sample.id}>
          <strong className="ref-cell">{sample.reference}</strong>
          <span>{sample.supplierName || sample.supplierEmail || <em>Non attribué</em>}</span>
          <span>{dateLabel(sample.dateDemande)}</span>
          <span className="status-detail"><Status value={sample.disponible} />{sample.disponible === "NO" && sample.dateDisponibilite && <small>Prévue · {dateLabel(sample.dateDisponibilite)}</small>}</span>
          <span>{dateLabel(sample.dateEnvoi)}</span>
          <span>{dateLabel(sample.dateReception)}</span>
          <span className="status-detail"><Status value={sample.renvoye} />{sample.renvoye === "YES" && sample.dateRenvoi && <small>{dateLabel(sample.dateRenvoi)}</small>}</span>
          <span>{filterValue(sample, "archive")}</span>
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
        <button type="button" className="filter-clear" onClick={() => onChange(undefined)}>Tout afficher</button>
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
      <strong className="ref-cell">{sample.reference}</strong>
      <select aria-label={`Fournisseur pour ${sample.reference}`} value={draft.supplierSelection || ""} onChange={(event) => update("supplierSelection", event.target.value)}>
        <option value="">Non attribué</option>
        {suppliers.map((supplier) => supplier.id ? (
          <option key={`account:${supplier.id}`} value={`account:${supplier.id}`}>
            {supplier.company ? `${supplier.company} — ` : ""}{supplier.email}
          </option>
        ) : (
          <option key={`named:${supplier.name}`} value={`named:${supplier.name}`}>{supplier.name}</option>
        ))}
      </select>
      <input aria-label={`Date de demande pour ${sample.reference}`} type="date" value={draft.dateDemande || ""} onChange={(event) => update("dateDemande", event.target.value)} />
      <div className="row-control-group">
        <select aria-label={`Disponibilité pour ${sample.reference}`} value={draft.disponible || ""} onChange={(event) => update("disponible", event.target.value)}>
          <option value="">À renseigner</option><option value="YES">YES</option><option value="NO">NO</option>
        </select>
        {draft.disponible === "NO" && <input aria-label={`Date de disponibilité pour ${sample.reference}`} type="date" value={draft.dateDisponibilite || ""} onChange={(event) => update("dateDisponibilite", event.target.value)} required />}
      </div>
      <input aria-label={`Date d'envoi pour ${sample.reference}`} type="date" value={draft.dateEnvoi || ""} onChange={(event) => update("dateEnvoi", event.target.value)} />
      <input aria-label={`Date de réception pour ${sample.reference}`} type="date" value={draft.dateReception || ""} onChange={(event) => update("dateReception", event.target.value)} />
      <div className="row-control-group">
        <select aria-label={`Statut de renvoi pour ${sample.reference}`} value={draft.renvoye || "NO"} onChange={(event) => update("renvoye", event.target.value)}>
          <option value="NO">NO</option><option value="YES">YES</option>
        </select>
        {draft.renvoye === "YES" && <input aria-label={`Date de renvoi pour ${sample.reference}`} type="date" value={draft.dateRenvoi || ""} onChange={(event) => update("dateRenvoi", event.target.value)} required />}
      </div>
      <div className="row-actions">
        <button className="icon-button save-icon" type="submit" aria-label={`Enregistrer ${sample.reference}`} title="Enregistrer" disabled={busy}><Save size={15} /></button>
        <button className="icon-button delete-icon" type="button" aria-label={`Supprimer ${sample.reference}`} title="Supprimer" onClick={() => onDelete(sample)} disabled={busy}><Trash2 size={15} /></button>
      </div>
    </form>
  );
}

function SupplierWorkspace({ samples, selectedId, setSelectedId, selectedSample, followup, setFollowup, saveFollowup, busy }) {
  return (
    <section className="supplier-workspace">
      <div className="section-heading"><div><p className="eyebrow">VOTRE ESPACE</p><h2>Mes échantillons</h2></div><span className="result-count">{samples.length} référence{samples.length > 1 ? "s" : ""}</span></div>
      {samples.length === 0 ? <EmptyState text="Aucun sample ne vous a encore été attribué. Contactez le gestionnaire." /> : (
        <div className="supplier-grid">
          <div className="supplier-list">
            {samples.map((sample) => <button key={sample.id} className={`supplier-sample ${String(sample.id) === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(String(sample.id))}>
              <span className="sample-icon"><Boxes size={17} /></span><span className="sample-copy"><strong>{sample.reference}</strong><small>{sample.dateDemande ? `Demande · ${dateLabel(sample.dateDemande)}` : "Informations à compléter"}</small></span><span className="sample-arrow">›</span>
            </button>)}
          </div>
          {selectedSample && <form className="form-panel followup-panel" onSubmit={saveFollowup}>
            <div className="followup-heading"><div><p className="eyebrow">FICHE ÉCHANTILLON</p><h2>{selectedSample.reference}</h2></div><span className="status-tag">{selectedSample.dateReception ? "Reçu" : "En cours"}</span></div>
            <div className="field-grid">
              <DateField label="Date de demande du sample" value={followup.dateDemande} onChange={(value) => setFollowup({ ...followup, dateDemande: value })} />
              <label className="form-field">Disponibilité<select value={followup.disponible} onChange={(event) => setFollowup({ ...followup, disponible: event.target.value, dateDisponibilite: event.target.value === "NO" ? followup.dateDisponibilite : "" })}><option value="">À renseigner</option><option value="YES">YES</option><option value="NO">NO</option></select></label>
              {followup.disponible === "NO" && <DateField label="Date de disponibilité prévue" value={followup.dateDisponibilite} onChange={(value) => setFollowup({ ...followup, dateDisponibilite: value })} required />}
              <DateField label="Date d'envoi du sample" value={followup.dateEnvoi} onChange={(value) => setFollowup({ ...followup, dateEnvoi: value })} />
              <DateField label="Date de réception du sample" value={followup.dateReception} onChange={(value) => setFollowup({ ...followup, dateReception: value })} />
              <label className="form-field">Sample renvoyé ?<select value={followup.renvoye} onChange={(event) => setFollowup({ ...followup, renvoye: event.target.value, dateRenvoi: event.target.value === "YES" ? followup.dateRenvoi : "" })}><option value="NO">NO</option><option value="YES">YES</option></select></label>
              {followup.renvoye === "YES" && <DateField label="Date de renvoi" value={followup.dateRenvoi} onChange={(value) => setFollowup({ ...followup, dateRenvoi: value })} required />}
            </div>
            <div className="save-row"><span><ShieldCheck size={15} /> Vos modifications sont partagées avec le gestionnaire</span><button className="button button-dark" disabled={busy}><Save size={16} /> {busy ? "Enregistrement…" : "Enregistrer"}</button></div>
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
  if (!value) return <span className="status-pill neutral">À renseigner</span>;
  return <span className={`status-pill ${value === "YES" ? "positive" : "negative"}`}><span />{value}</span>;
}

function EmptyState({ text }) {
  return <div className="empty-state"><span><PackagePlus size={20} /></span><p>{text}</p></div>;
}

function Message({ message }) {
  return <div className={`message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}{message.text}</div>;
}

export default App;
