import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const databaseUrl =
	process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL_UNPOOLED, DATABASE_URL_DIRECT, or DATABASE_URL is required",
	);
}

const pool = new pg.Pool({
	connectionString: databaseUrl,
	max: 1,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 10_000,
	ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: true },
});

const migrationsUrl = new URL("../migrations/", import.meta.url);

try {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name text PRIMARY KEY,
			checksum text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`);

	const names = (await readdir(migrationsUrl))
		.filter((name) => /^\d+_.+\.sql$/.test(name))
		.sort();
	for (const name of names) {
		const sql = await readFile(new URL(name, migrationsUrl), "utf8");
		const checksum = createHash("sha256").update(sql).digest("hex");
		const existing = await pool.query(
			"SELECT checksum FROM schema_migrations WHERE name = $1",
			[name],
		);
		if (existing.rows[0]) {
			if (existing.rows[0].checksum !== checksum) {
				throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${name}`);
			}
			continue;
		}

		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(sql);
			await client.query(
				"INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
				[name, checksum],
			);
			await client.query("COMMIT");
			console.log(JSON.stringify({ event: "migration_applied", migration: name }));
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
} finally {
	await pool.end();
}
