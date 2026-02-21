use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub type MemoryDb = Arc<Mutex<Connection>>;

/// A semantic fact extracted from conversations
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Fact {
    pub id: String,
    pub key: String,
    pub value: String,
    pub source_session: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn init_db(path: &std::path::Path) -> Result<MemoryDb, String> {
    let conn =
        Connection::open(path).map_err(|e| format!("Failed to open memory DB: {}", e))?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS facts (
            id             TEXT PRIMARY KEY,
            key            TEXT NOT NULL UNIQUE,
            value          TEXT NOT NULL,
            source_session TEXT,
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create memory tables: {}", e))?;

    Ok(Arc::new(Mutex::new(conn)))
}

// === Facts CRUD ===

pub fn get_all_facts(db: &MemoryDb) -> Result<Vec<Fact>, String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, key, value, source_session, created_at, updated_at FROM facts ORDER BY updated_at DESC")
        .map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Fact {
                id: row.get(0)?,
                key: row.get(1)?,
                value: row.get(2)?,
                source_session: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    let mut facts = Vec::new();
    for row in rows {
        facts.push(row.map_err(|e| format!("Row error: {}", e))?);
    }
    Ok(facts)
}

pub fn upsert_fact(db: &MemoryDb, fact: &Fact) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    conn.execute(
        "INSERT INTO facts (id, key, value, source_session, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, source_session = excluded.source_session, updated_at = excluded.updated_at",
        rusqlite::params![fact.id, fact.key, fact.value, fact.source_session, fact.created_at, fact.updated_at],
    )
    .map_err(|e| format!("Upsert error: {}", e))?;
    Ok(())
}

pub fn delete_fact(db: &MemoryDb, fact_id: &str) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    conn.execute("DELETE FROM facts WHERE id = ?1", [fact_id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_db() -> (MemoryDb, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test_memory.db");
        let db = init_db(&db_path).unwrap();
        (db, dir)
    }

    #[test]
    fn init_db_creates_facts_table() {
        let (db, _dir) = test_db();
        let conn = db.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = 'facts'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn init_db_enables_wal_mode() {
        let (db, _dir) = test_db();
        let conn = db.lock().unwrap();
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }

    #[test]
    fn init_db_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let _db1 = init_db(&db_path).unwrap();
        let _db2 = init_db(&db_path).unwrap();
    }

    #[test]
    fn facts_crud_lifecycle() {
        let (db, _dir) = test_db();

        // Insert
        let fact = Fact {
            id: "f1".into(), key: "user_name".into(), value: "Luke".into(),
            source_session: Some("s1".into()), created_at: 1000, updated_at: 1000,
        };
        upsert_fact(&db, &fact).unwrap();

        // Read
        let facts = get_all_facts(&db).unwrap();
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].key, "user_name");
        assert_eq!(facts[0].value, "Luke");

        // Upsert (update existing key)
        let fact2 = Fact {
            id: "f2".into(), key: "user_name".into(), value: "Luke Kim".into(),
            source_session: Some("s2".into()), created_at: 1000, updated_at: 2000,
        };
        upsert_fact(&db, &fact2).unwrap();
        let facts = get_all_facts(&db).unwrap();
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].value, "Luke Kim");

        // Delete
        delete_fact(&db, &facts[0].id).unwrap();
        let facts = get_all_facts(&db).unwrap();
        assert!(facts.is_empty());
    }
}
