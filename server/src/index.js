import bcrypt from "bcryptjs";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { requireAuth, requireRole } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET doit contenir au moins 32 caractères.");
}

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "20kb" }));

const sampleFields = {
  dateDemande: "date_demande",
  disponible: "disponible",
  dateDisponibilite: "date_disponibilite",
  dateEnvoi: "date_envoi",
  dateReception: "date_reception",
  renvoye: "renvoye",
  dateRenvoi: "date_renvoi",
};

function presentSample(row) {
  return {
    id: row.id,
    reference: row.reference,
    supplierId: row.supplier_id,
    supplierEmail: row.supplier_email || null,
    supplierName: row.supplier_name || null,
    dateDemande: row.date_demande,
    disponible: row.disponible,
    dateDisponibilite: row.date_disponibilite,
    dateEnvoi: row.date_envoi,
    dateReception: row.date_reception,
    renvoye: row.renvoye ? "YES" : "NO",
    dateRenvoi: row.date_renvoi,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
  };
}

function presentUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    jobTitle: row.job_title,
  };
}

function isOptionalDate(value) {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || value.length !== 10 || value[4] !== "-" || value[7] !== "-") return false;
  const digits = value.slice(0, 4) + value.slice(5, 7) + value.slice(8, 10);
  if ([...digits].some((character) => character < "0" || character > "9")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch {
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const firstName = String(request.body.firstName || "").trim();
    const lastName = String(request.body.lastName || "").trim();
    const accountType = request.body.accountType;
    const company = String(request.body.company || "").trim();
    const jobTitle = String(request.body.jobTitle || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response.status(400).json({ error: "Adresse e-mail invalide." });
    }
    if (password.length < 12) {
      return response.status(400).json({ error: "Le mot de passe doit contenir au moins 12 caractères." });
    }
    if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
      return response.status(400).json({ error: "Le prénom et le nom sont obligatoires (100 caractères maximum)." });
    }
    if (accountType === "supplier" && (!company || company.length > 150)) {
      return response.status(400).json({ error: "Le nom de l’entreprise est obligatoire (150 caractères maximum)." });
    }
    if (accountType === "referrer" && (!jobTitle || jobTitle.length > 120)) {
      return response.status(400).json({ error: "Le poste occupé est obligatoire (120 caractères maximum)." });
    }
    if (!["supplier", "referrer"].includes(accountType)) {
      return response.status(400).json({ error: "Type de compte invalide." });
    }

    const role = accountType === "referrer" ? "manager" : "supplier";
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, company, job_title)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, role, first_name, last_name, company, job_title`,
      [email, passwordHash, role, firstName, lastName,
       accountType === "referrer" ? "Lacoste" : company,
       accountType === "referrer" ? jobTitle : null]
    );
    const user = presentUser(result.rows[0]);
    const token = jwt.sign(
      { sub: String(user.id), role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return response.status(201).json({ token, user });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Cette adresse e-mail possède déjà un compte." });
    return next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const result = await pool.query(
      "SELECT id, email, password_hash, role, first_name, last_name, company, job_title FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return response.status(401).json({ error: "Adresse e-mail ou mot de passe incorrect." });
    }
    const token = jwt.sign(
      { sub: String(user.id), role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return response.json({ token, user: presentUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (request, response, next) => {
  try {
    const result = await pool.query(
      "SELECT id, email, role, first_name, last_name, company, job_title FROM users WHERE id = $1",
      [request.user.sub]
    );
    if (!result.rowCount) return response.status(401).json({ error: "Compte introuvable." });
    return response.json({ user: presentUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/users/suppliers", requireAuth, requireRole("manager"), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, company, NULL::text AS name FROM users WHERE role = 'supplier'
       UNION ALL
       SELECT NULL::bigint AS id, NULL::text AS email, NULL::text AS company, name
       FROM supplier_directory
       ORDER BY company NULLS LAST, email NULLS LAST, name NULLS LAST`
    );
    return response.json({ suppliers: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/users/suppliers", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const [localPart, domain, ...extra] = email.split("@");
    if (!localPart || !domain || extra.length || !domain.includes(".") || password.length < 12) {
      return response.status(400).json({ error: "E-mail invalide ou mot de passe inférieur à 12 caractères." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'supplier') RETURNING id, email",
      [email, passwordHash]
    );
    return response.status(201).json({ supplier: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Cet e-mail existe déjà." });
    return next(error);
  }
});

app.get("/api/samples", requireAuth, async (request, response, next) => {
  try {
    const supplierOnly = request.user.role === "supplier";
    const result = await pool.query(
      `SELECT s.*, u.email AS supplier_email
       FROM samples s LEFT JOIN users u ON u.id = s.supplier_id
       WHERE s.deleted_at IS NULL ${supplierOnly ? "AND s.supplier_id = $1" : ""}
       ORDER BY s.created_at DESC`,
      supplierOnly ? [request.user.sub] : []
    );
    return response.json({ samples: result.rows.map(presentSample) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/samples/history", requireAuth, requireRole("manager"), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.email AS supplier_email
       FROM samples s LEFT JOIN users u ON u.id = s.supplier_id
       WHERE s.deleted_at IS NOT NULL
       ORDER BY s.deleted_at DESC, s.created_at DESC`
    );
    return response.json({ samples: result.rows.map(presentSample) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/samples", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const reference = String(request.body.reference || "").trim();
    const supplierId = request.body.supplierId ? Number(request.body.supplierId) : null;
    const supplierName = String(request.body.supplierName || "").trim() || null;
    if (!reference || reference.length > 100) {
      return response.status(400).json({ error: "La référence doit contenir entre 1 et 100 caractères." });
    }
    if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) {
      return response.status(400).json({ error: "Fournisseur invalide." });
    }
    if (supplierName && supplierName.length > 150) {
      return response.status(400).json({ error: "Le nom du fournisseur ne peut pas dépasser 150 caractères." });
    }
    if (supplierId !== null && supplierName) {
      return response.status(400).json({ error: "Choisissez un compte fournisseur ou un nom, pas les deux." });
    }
    const result = await pool.query(
      `WITH supplier AS (
         INSERT INTO supplier_directory (name)
         SELECT $3
         WHERE $3 IS NOT NULL
         ON CONFLICT (LOWER(name)) DO UPDATE SET name = supplier_directory.name
         RETURNING name
       )
       INSERT INTO samples (reference, supplier_id, supplier_name)
       VALUES ($1, $2, (SELECT name FROM supplier))
       RETURNING *`,
      [reference, supplierId, supplierName]
    );
    return response.status(201).json({ sample: presentSample(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Cette référence existe déjà." });
    if (error.code === "23503") return response.status(400).json({ error: "Fournisseur introuvable." });
    return next(error);
  }
});

app.patch("/api/manager/samples/:id", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Identifiant invalide." });
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Corps de requête invalide." });
    }

    const allowed = new Set([...Object.keys(sampleFields), "supplierId", "supplierName"]);
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !allowed.has(key))) {
      return response.status(400).json({ error: "Champs de suivi invalides." });
    }
    if ("disponible" in body && body.disponible !== null && body.disponible !== "" && !["YES", "NO"].includes(body.disponible)) {
      return response.status(400).json({ error: "La disponibilité doit être YES ou NO." });
    }
    if ("renvoye" in body && !["YES", "NO"].includes(body.renvoye)) {
      return response.status(400).json({ error: "Le statut de renvoi doit être YES ou NO." });
    }
    for (const key of ["dateDemande", "dateDisponibilite", "dateEnvoi", "dateReception", "dateRenvoi"]) {
      if (key in body && !isOptionalDate(body[key])) {
        return response.status(400).json({ error: `Format de date invalide pour ${key}.` });
      }
    }

    const currentResult = await pool.query(
      "SELECT * FROM samples WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (!currentResult.rowCount) return response.status(404).json({ error: "Sample introuvable." });
    const values = { ...currentResult.rows[0] };
    for (const [key, column] of Object.entries(sampleFields)) {
      if (key in body) values[column] = key === "renvoye" ? body[key] === "YES" : (body[key] || null);
    }
    if (values.disponible === "NO" && !values.date_disponibilite) {
      return response.status(400).json({ error: "Indiquez la date de disponibilité prévue si le sample n'est pas disponible." });
    }
    if (values.disponible !== "NO") values.date_disponibilite = null;
    if (!values.renvoye) values.date_renvoi = null;
    if (values.renvoye && !values.date_renvoi) {
      return response.status(400).json({ error: "Indiquez la date de renvoi si le sample a été renvoyé." });
    }

    let supplierId = values.supplier_id;
    let supplierName = values.supplier_name;
    if ("supplierId" in body || "supplierName" in body) {
      supplierId = body.supplierId ? Number(body.supplierId) : null;
      supplierName = String(body.supplierName || "").trim() || null;
      if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) {
        return response.status(400).json({ error: "Fournisseur invalide." });
      }
      if (supplierId !== null && supplierName) {
        return response.status(400).json({ error: "Choisissez un compte fournisseur ou un nom, pas les deux." });
      }
      if (supplierId !== null) {
        const supplierResult = await pool.query(
          "SELECT id FROM users WHERE id = $1 AND role = 'supplier'",
          [supplierId]
        );
        if (!supplierResult.rowCount) return response.status(400).json({ error: "Fournisseur introuvable." });
      }
      if (supplierName) {
        const supplierResult = await pool.query(
          "SELECT name FROM supplier_directory WHERE LOWER(name) = LOWER($1)",
          [supplierName]
        );
        if (!supplierResult.rowCount) return response.status(400).json({ error: "Fournisseur introuvable dans la liste." });
        supplierName = supplierResult.rows[0].name;
      }
    }

    const updatedResult = await pool.query(
      `UPDATE samples SET supplier_id = $1, supplier_name = $2, date_demande = $3,
         disponible = $4, date_disponibilite = $5, date_envoi = $6,
         date_reception = $7, renvoye = $8, date_renvoi = $9, updated_at = NOW()
       WHERE id = $10 AND deleted_at IS NULL`,
      [supplierId, supplierName, values.date_demande, values.disponible,
       values.date_disponibilite, values.date_envoi, values.date_reception,
       values.renvoye, values.date_renvoi, id]
    );
    if (!updatedResult.rowCount) return response.status(404).json({ error: "Sample introuvable." });
    const result = await pool.query(
      `SELECT s.*, u.email AS supplier_email
       FROM samples s LEFT JOIN users u ON u.id = s.supplier_id
       WHERE s.id = $1`,
      [id]
    );
    return response.json({ sample: presentSample(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/samples/:id", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Identifiant invalide." });
    const result = await pool.query(
      `UPDATE samples SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (!result.rowCount) return response.status(404).json({ error: "Référence introuvable." });
    return response.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/samples/:id", requireAuth, requireRole("supplier"), async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Identifiant invalide." });
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Corps de requête invalide." });
    }
    const keys = Object.keys(body);
    const allowed = new Set(Object.keys(sampleFields));
    if (!keys.length || keys.some((key) => !allowed.has(key))) {
      return response.status(400).json({ error: "Champs de suivi invalides." });
    }
    if ("disponible" in body && body.disponible !== null && !["YES", "NO"].includes(body.disponible)) {
      return response.status(400).json({ error: "La disponibilité doit être YES ou NO." });
    }
    if ("renvoye" in body && !["YES", "NO"].includes(body.renvoye)) {
      return response.status(400).json({ error: "Le statut de renvoi doit être YES ou NO." });
    }
    for (const key of ["dateDemande", "dateDisponibilite", "dateEnvoi", "dateReception", "dateRenvoi"]) {
      if (key in body && !isOptionalDate(body[key])) {
        return response.status(400).json({ error: `Format de date invalide pour ${key}.` });
      }
    }

    const currentResult = await pool.query(
      "SELECT * FROM samples WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL",
      [id, request.user.sub]
    );
    if (!currentResult.rowCount) return response.status(404).json({ error: "Sample introuvable." });
    const values = { ...currentResult.rows[0] };
    for (const [key, column] of Object.entries(sampleFields)) {
      if (key in body) values[column] = key === "renvoye" ? body[key] === "YES" : (body[key] || null);
    }
    if (values.disponible === "NO" && !values.date_disponibilite) {
      return response.status(400).json({ error: "Indiquez la date de disponibilité prévue si le sample n'est pas disponible." });
    }
    if (values.disponible !== "NO") values.date_disponibilite = null;
    if (!values.renvoye) values.date_renvoi = null;
    if (values.renvoye && !values.date_renvoi) {
      return response.status(400).json({ error: "Indiquez la date de renvoi si le sample a été renvoyé." });
    }

    const result = await pool.query(
      `UPDATE samples SET date_demande = $1, disponible = $2, date_disponibilite = $3,
         date_envoi = $4, date_reception = $5, renvoye = $6, date_renvoi = $7, updated_at = NOW()
       WHERE id = $8 AND supplier_id = $9 AND deleted_at IS NULL RETURNING *`,
      [values.date_demande, values.disponible, values.date_disponibilite,
       values.date_envoi, values.date_reception, values.renvoye,
       values.date_renvoi, id, request.user.sub]
    );
    return response.json({ sample: presentSample(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Route API introuvable." });
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(currentDirectory, "../../client/dist");
  app.use(express.static(clientDist));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Une erreur interne est survenue." });
});

const schemaPath = path.resolve(currentDirectory, "../db/schema.sql");
const schema = await readFile(schemaPath, "utf8");
await pool.query(schema);

app.listen(port, "0.0.0.0", () => console.log(`API disponible sur le port ${port}`));
