import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});
