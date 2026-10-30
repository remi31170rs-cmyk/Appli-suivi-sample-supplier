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
  throw new Error("JWT_SECRET must be at least 32 characters long.");
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
    phone: row.phone,
  };
}

function validInternationalPhone(value) {
  if (typeof value !== "string" || !/^\+[0-9\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
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
    const phone = String(request.body.phone || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response.status(400).json({ error: "Invalid email address." });
    }
    if (password.length < 12) {
      return response.status(400).json({ error: "Password must be at least 12 characters long." });
    }
    if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
      return response.status(400).json({ error: "First and last name are required (100 characters maximum)." });
    }
    if (accountType === "supplier" && (!company || company.length > 150)) {
      return response.status(400).json({ error: "Company name is required (150 characters maximum)." });
    }
    if (accountType === "supplier" && !validInternationalPhone(phone)) {
      return response.status(400).json({ error: "Enter a valid international phone number, including the country code (e.g. +33 6 12 34 56 78)." });
    }
    if (accountType === "referrer" && (!jobTitle || jobTitle.length > 120)) {
      return response.status(400).json({ error: "Job title is required (120 characters maximum)." });
    }
    if (!["supplier", "referrer"].includes(accountType)) {
      return response.status(400).json({ error: "Invalid account type." });
    }

    const role = accountType === "referrer" ? "manager" : "supplier";
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, company, job_title, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, role, first_name, last_name, company, job_title, phone`,
      [email, passwordHash, role, firstName, lastName,
       accountType === "referrer" ? "Lacoste" : company,
       accountType === "referrer" ? jobTitle : null,
       accountType === "supplier" ? phone : null]
    );
    const user = presentUser(result.rows[0]);
    const token = jwt.sign(
      { sub: String(user.id), role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return response.status(201).json({ token, user });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "An account with this email address already exists." });
    return next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const result = await pool.query(
      "SELECT id, email, password_hash, role, first_name, last_name, company, job_title, phone FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return response.status(401).json({ error: "Incorrect email address or password." });
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
      "SELECT id, email, role, first_name, last_name, company, job_title, phone FROM users WHERE id = $1",
      [request.user.sub]
    );
    if (!result.rowCount) return response.status(401).json({ error: "Account not found." });
    return response.json({ user: presentUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/users/suppliers", requireAuth, requireRole("manager"), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, company, NULL::text AS name, first_name, last_name, phone,
              'account'::text AS kind FROM users WHERE role = 'supplier'
       UNION ALL
       SELECT id, email, name AS company, name, first_name, last_name, phone,
              'directory'::text AS kind
       FROM supplier_directory
       ORDER BY company NULLS LAST, email NULLS LAST, name NULLS LAST`
    );
    return response.json({ suppliers: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/suppliers/directory", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const name = String(request.body.name || "").trim();
    const firstName = String(request.body.firstName || "").trim();
    const lastName = String(request.body.lastName || "").trim();
    const email = String(request.body.email || "").trim().toLowerCase();
    const phone = String(request.body.phone || "").trim();
    if (!name || name.length > 150 || !firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
      return response.status(400).json({ error: "Supplier name and contact first and last names are required. Limits: supplier 150 characters; first and last names 100 characters." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response.status(400).json({ error: "Invalid email address." });
    }
    if (!validInternationalPhone(phone)) {
      return response.status(400).json({ error: "Enter a valid international phone number, including the country code (e.g. +33 6 12 34 56 78)." });
    }
    const result = await pool.query(
      `INSERT INTO supplier_directory (name, first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (LOWER(name)) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone
       RETURNING id, name, first_name, last_name, email, phone`,
      [name, firstName, lastName, email, phone]
    );
    return response.status(201).json({ supplier: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "This email address is already used by a supplier." });
    return next(error);
  }
});

app.patch("/api/suppliers/directory/:id", requireAuth, requireRole("manager"), async (request, response, next) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Invalid ID." });

  const name = String(request.body.name || "").trim();
  const firstName = String(request.body.firstName || "").trim();
  const lastName = String(request.body.lastName || "").trim();
  const email = String(request.body.email || "").trim().toLowerCase();
  const phone = String(request.body.phone || "").trim();
  if (!name || name.length > 150 || !firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    return response.status(400).json({ error: "Supplier name and contact first and last names are required. Limits: supplier 150 characters; first and last names 100 characters." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response.status(400).json({ error: "Invalid email address." });
  }
  if (!validInternationalPhone(phone)) {
    return response.status(400).json({ error: "Enter a valid international phone number, including the country code (e.g. +33 6 12 34 56 78)." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const current = await client.query("SELECT name FROM supplier_directory WHERE id = $1", [id]);
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Supplier not found." });
    }
    const result = await client.query(
      `UPDATE supplier_directory SET name = $1, first_name = $2, last_name = $3, email = $4, phone = $5
       WHERE id = $6 RETURNING id, name, first_name, last_name, email, phone`,
      [name, firstName, lastName, email, phone, id]
    );
    if (current.rows[0].name !== name) {
      await client.query(
        `UPDATE samples SET supplier_name = $1, updated_at = NOW()
         WHERE supplier_id IS NULL AND LOWER(supplier_name) = LOWER($2)`,
        [name, current.rows[0].name]
      );
    }
    await client.query("COMMIT");
    return response.json({ supplier: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error.code === "23505") return response.status(409).json({ error: "This email address or supplier name is already in use." });
    return next(error);
  } finally {
    client?.release();
  }
});

app.patch("/api/users/suppliers/:id", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Invalid ID." });
    const email = String(request.body.email || "").trim().toLowerCase();
    const firstName = String(request.body.firstName || "").trim();
    const lastName = String(request.body.lastName || "").trim();
    const company = String(request.body.company || "").trim();
    const phone = String(request.body.phone || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response.status(400).json({ error: "Invalid email address." });
    }
    if (firstName.length > 100 || lastName.length > 100 || company.length > 150) {
      return response.status(400).json({ error: "Supplier information exceeds the allowed length." });
    }
    if (phone && !validInternationalPhone(phone)) {
      return response.status(400).json({ error: "Enter a valid international phone number, including the country code (e.g. +33 6 12 34 56 78)." });
    }
    const result = await pool.query(
      `UPDATE users SET email = $1, first_name = $2, last_name = $3, company = $4, phone = $5
       WHERE id = $6 AND role = 'supplier'
       RETURNING id, email, company, first_name, last_name, phone`,
      [email, firstName || null, lastName || null, company || null, phone || null, id]
    );
    if (!result.rowCount) return response.status(404).json({ error: "Supplier account not found." });
    return response.json({ supplier: { ...result.rows[0], kind: "account" } });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "This email address is already used by a supplier." });
    return next(error);
  }
});

app.post("/api/users/suppliers", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const [localPart, domain, ...extra] = email.split("@");
    if (!localPart || !domain || extra.length || !domain.includes(".") || password.length < 12) {
      return response.status(400).json({ error: "Invalid email address or password shorter than 12 characters." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'supplier') RETURNING id, email",
      [email, passwordHash]
    );
    return response.status(201).json({ supplier: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "This email address already exists." });
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
      return response.status(400).json({ error: "Reference must contain between 1 and 100 characters." });
    }
    if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) {
      return response.status(400).json({ error: "Invalid supplier." });
    }
    if (supplierName && supplierName.length > 150) {
      return response.status(400).json({ error: "Supplier name cannot exceed 150 characters." });
    }
    if (supplierId !== null && supplierName) {
      return response.status(400).json({ error: "Choose either a supplier account or a supplier name, not both." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (supplierName) {
        const supplierResult = await client.query(
          `INSERT INTO supplier_directory (name) VALUES ($1)
           ON CONFLICT (LOWER(name)) DO UPDATE SET name = supplier_directory.name
           RETURNING name`,
          [supplierName]
        );
        if (!supplierResult.rowCount) throw new Error("Could not find the selected supplier.");
      }
      const result = await client.query(
        `INSERT INTO samples (reference, supplier_id, supplier_name)
         VALUES ($1, $2, $3) RETURNING *`,
        [reference, supplierId, supplierName]
      );
      await client.query("COMMIT");
      return response.status(201).json({ sample: presentSample(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "This reference already exists." });
    if (error.code === "23503") return response.status(400).json({ error: "Supplier not found." });
    return next(error);
  }
});

app.patch("/api/manager/samples/:id", requireAuth, requireRole("manager"), async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Invalid ID." });
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Invalid request body." });
    }

    const allowed = new Set([...Object.keys(sampleFields), "supplierId", "supplierName"]);
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !allowed.has(key))) {
      return response.status(400).json({ error: "Invalid tracking fields." });
    }
    if ("disponible" in body && body.disponible !== null && body.disponible !== "" && !["YES", "NO"].includes(body.disponible)) {
      return response.status(400).json({ error: "Availability must be YES or NO." });
    }
    if ("renvoye" in body && !["YES", "NO"].includes(body.renvoye)) {
      return response.status(400).json({ error: "Return status must be YES or NO." });
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
    if (!currentResult.rowCount) return response.status(404).json({ error: "Sample not found." });
    const values = { ...currentResult.rows[0] };
    for (const [key, column] of Object.entries(sampleFields)) {
      if (key in body) values[column] = key === "renvoye" ? body[key] === "YES" : (body[key] || null);
    }
    if (values.disponible === "NO" && !values.date_disponibilite) {
      return response.status(400).json({ error: "Enter the expected availability date when the sample is unavailable." });
    }
    if (values.disponible !== "NO") values.date_disponibilite = null;
    if (!values.renvoye) values.date_renvoi = null;
    if (values.renvoye && !values.date_renvoi) {
      return response.status(400).json({ error: "Enter the return date when the sample has been returned." });
    }

    let supplierId = values.supplier_id;
    let supplierName = values.supplier_name;
    if ("supplierId" in body || "supplierName" in body) {
      supplierId = body.supplierId ? Number(body.supplierId) : null;
      supplierName = String(body.supplierName || "").trim() || null;
      if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) {
        return response.status(400).json({ error: "Invalid supplier." });
      }
      if (supplierId !== null && supplierName) {
        return response.status(400).json({ error: "Choose either a supplier account or a supplier name, not both." });
      }
      if (supplierId !== null) {
        const supplierResult = await pool.query(
          "SELECT id FROM users WHERE id = $1 AND role = 'supplier'",
          [supplierId]
        );
        if (!supplierResult.rowCount) return response.status(400).json({ error: "Supplier not found." });
      }
      if (supplierName) {
        const supplierResult = await pool.query(
          "SELECT name FROM supplier_directory WHERE LOWER(name) = LOWER($1)",
          [supplierName]
        );
        if (!supplierResult.rowCount) return response.status(400).json({ error: "Supplier not found in the directory." });
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
    if (!updatedResult.rowCount) return response.status(404).json({ error: "Sample not found." });
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
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Invalid ID." });
    const result = await pool.query(
      `UPDATE samples SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (!result.rowCount) return response.status(404).json({ error: "Reference not found." });
    return response.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/samples/:id", requireAuth, requireRole("supplier"), async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Invalid ID." });
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Invalid request body." });
    }
    const keys = Object.keys(body);
    const allowed = new Set(Object.keys(sampleFields));
    if (!keys.length || keys.some((key) => !allowed.has(key))) {
      return response.status(400).json({ error: "Invalid tracking fields." });
    }
    if ("disponible" in body && body.disponible !== null && !["YES", "NO"].includes(body.disponible)) {
      return response.status(400).json({ error: "Availability must be YES or NO." });
    }
    if ("renvoye" in body && !["YES", "NO"].includes(body.renvoye)) {
      return response.status(400).json({ error: "Return status must be YES or NO." });
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
    if (!currentResult.rowCount) return response.status(404).json({ error: "Sample not found." });
    const values = { ...currentResult.rows[0] };
    for (const [key, column] of Object.entries(sampleFields)) {
      if (key in body) values[column] = key === "renvoye" ? body[key] === "YES" : (body[key] || null);
    }
    if (values.disponible === "NO" && !values.date_disponibilite) {
      return response.status(400).json({ error: "Enter the expected availability date when the sample is unavailable." });
    }
    if (values.disponible !== "NO") values.date_disponibilite = null;
    if (!values.renvoye) values.date_renvoi = null;
    if (values.renvoye && !values.date_renvoi) {
      return response.status(400).json({ error: "Enter the return date when the sample has been returned." });
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
  response.status(404).json({ error: "API route not found." });
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
  response.status(500).json({ error: "An internal error occurred." });
});

const schemaPath = path.resolve(currentDirectory, "../db/schema.sql");
const schema = await readFile(schemaPath, "utf8");
await pool.query(schema);

app.listen(port, "0.0.0.0", () => console.log(`API disponible sur le port ${port}`));
