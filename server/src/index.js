import bcrypt from "bcryptjs";
import cors from "cors";
import "dotenv/config";
import express from "express";
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
    dateDemande: row.date_demande,
    disponible: row.disponible,
    dateDisponibilite: row.date_disponibilite,
    dateEnvoi: row.date_envoi,
    dateReception: row.date_reception,
    renvoye: row.renvoye ? "YES" : "NO",
    dateRenvoi: row.date_renvoi,
    updatedAt: row.updated_at,
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

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const result = await pool.query(
      "SELECT id, email, password_hash, role FROM users WHERE email = $1",
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
    return response.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (request, response, next) => {
  try {
    const result = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [request.user.sub]);
    if (!result.rowCount) return response.status(401).json({ error: "Compte introuvable." });
    return response.json({ user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/users/suppliers", requireAuth, requireRole("manager"), async (_request, response, next) => {
  try {
    const result = await pool.query("SELECT id, email FROM users WHERE role = 'supplier' ORDER BY email");
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
       ${supplierOnly ? "WHERE s.supplier_id = $1" : ""}
       ORDER BY s.created_at DESC`,
      supplierOnly ? [request.user.sub] : []
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
    if (!reference || reference.length > 100) {
      return response.status(400).json({ error: "La référence doit contenir entre 1 et 100 caractères." });
    }
    if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) {
      return response.status(400).json({ error: "Fournisseur invalide." });
    }
    const result = await pool.query(
      "INSERT INTO samples (reference, supplier_id) VALUES ($1, $2) RETURNING *",
      [reference, supplierId]
    );
    return response.status(201).json({ sample: presentSample(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Cette référence existe déjà." });
    if (error.code === "23503") return response.status(400).json({ error: "Fournisseur introuvable." });
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
      "SELECT * FROM samples WHERE id = $1 AND supplier_id = $2",
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
       WHERE id = $8 AND supplier_id = $9 RETURNING *`,
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

app.listen(port, () => console.log(`API disponible sur http://localhost:${port}`));
