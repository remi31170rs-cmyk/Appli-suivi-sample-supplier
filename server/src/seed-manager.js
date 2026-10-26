import bcrypt from "bcryptjs";
import "dotenv/config";
import { pool } from "./db.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  console.error("Définir ADMIN_EMAIL et un ADMIN_PASSWORD d'au moins 12 caractères dans server/.env.");
  process.exitCode = 1;
} else {
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'manager')
       ON CONFLICT (email) DO NOTHING`,
      [email, passwordHash]
    );
    console.log(`Compte gestionnaire prêt : ${email}`);
  } catch (error) {
    console.error("Impossible de créer le compte gestionnaire.", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
