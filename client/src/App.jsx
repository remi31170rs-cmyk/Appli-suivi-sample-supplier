import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  Check,
  CircleHelp,
  Factory,
  LogOut,
  PackagePlus,
  Plus,
  Save,
  ShieldCheck,
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
  const [suppliers, setSuppliers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [followup, setFollowup] = useState(emptyFollowup);
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [newSupplier, setNewSupplier] = useState({ email: "", password: "" });
  const [newReference, setNewReference] = useState({ reference: "", supplierId: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function loadWorkspace(authToken, currentUser) {
    const { samples: sampleRows } = await api("/api/samples", authToken);
    setSamples(sampleRows);
    if (currentUser.role === "manager") {
      const { suppliers: supplierRows } = await api("/api/users/suppliers", authToken);
      setSuppliers(supplierRows);
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

  function signOut() {
    localStorage.removeItem("sample-token");
    setToken("");
    setUser(null);
    setSamples([]);
    setSuppliers([]);
    setSelectedId("");
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

  async function createSample(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/samples", token, {
        method: "POST",
        body: JSON.stringify(newReference),
      });
      await loadWorkspace(token, user);
      setNewReference({ reference: "", supplierId: "" });
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
            <h2>Connexion</h2>
            <p className="muted">Connectez-vous à votre espace de suivi fournisseur.</p>
            {message && <Message message={message} />}
            <form className="stack-form" onSubmit={submitLogin}>
              <label>Adresse e-mail<input type="email" autoComplete="username" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} required /></label>
              <label>Mot de passe<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required /></label>
              <button className="button button-dark button-wide" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}<ArrowUpRight size={17} /></button>
            </form>
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
          <div className="account-card"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span><span className="account-name"><strong>{user.email}</strong><small>{manager ? "Gestionnaire" : "Fournisseur"}</small></span></div>
          <button className="signout" onClick={signOut}><LogOut size={16} /> Déconnexion</button>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="page-header">
          <div><p className="eyebrow">{manager ? "GESTION FOURNISSEURS" : "PORTAIL FOURNISSEUR"}</p><h1>Suivi des échantillons</h1></div>
          <div className="header-right"><span className="connection"><span /> Connecté</span><span className="header-date">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}</span></div>
        </header>
        {message && <Message message={message} />}

        {manager ? (
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
                  <div className="sample-table">
                    <div className="table-head"><span>RÉFÉRENCE</span><span>FOURNISSEUR</span><span>DEMANDE</span><span>DISPONIBILITÉ</span><span>ENVOI</span><span>RÉCEPTION</span><span>RENVOI</span></div>
                    {samples.map((sample) => <div className="table-row" key={sample.id}>
                      <strong className="ref-cell">{sample.reference}</strong>
                      <span>{sample.supplierEmail || <em>Non attribué</em>}</span>
                      <span>{dateLabel(sample.dateDemande)}</span>
                      <span className="status-detail"><Status value={sample.disponible} />{sample.disponible === "NO" && <small>Prévue · {dateLabel(sample.dateDisponibilite)}</small>}</span>
                      <span>{dateLabel(sample.dateEnvoi)}</span>
                      <span>{dateLabel(sample.dateReception)}</span>
                      <span className="status-detail"><Status value={sample.renvoye} />{sample.renvoye === "YES" && <small>{dateLabel(sample.dateRenvoi)}</small>}</span>
                    </div>)}
                  </div>
                )}
              </div>
              <aside className="forms-column">
                <section className="form-panel">
                  <div className="panel-title"><span className="panel-icon mint"><Users size={18} /></span><div><h3>Ajouter un fournisseur</h3><p>Créer son accès sécurisé</p></div></div>
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
                    <label>Fournisseur<select value={newReference.supplierId} onChange={(event) => setNewReference({ ...newReference, supplierId: event.target.value })}><option value="">Non attribué</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.email}</option>)}</select></label>
                    <button className="button button-dark" disabled={busy}><Plus size={16} /> Créer la référence</button>
                  </form>
                </section>
              </aside>
            </section>
          </>
        ) : (
          <SupplierWorkspace samples={samples} selectedId={selectedId} setSelectedId={setSelectedId} selectedSample={selectedSample} followup={followup} setFollowup={setFollowup} saveFollowup={saveFollowup} busy={busy} />
        )}
        <footer className="page-footer"><span>Sample Desk · Suivi fournisseurs</span><span><CircleHelp size={14} /> Les modifications sont enregistrées dans la base partagée.</span></footer>
      </main>
    </div>
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
