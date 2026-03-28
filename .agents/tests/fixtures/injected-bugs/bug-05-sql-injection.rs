// Extracted from shell/src-tauri/src/audit.rs — query function

use rusqlite::{Connection, params};

pub struct AuditEntry {
    pub id: i64,
    pub timestamp: String,
    pub action: String,
    pub detail: String,
}

const MAX_LIMIT: u32 = 1000;

/// Query audit log entries with optional filter
pub fn query_audit_log(
    conn: &Connection,
    filter: Option<&str>,  // User-provided filter string
    limit: u32,
    offset: u32,
) -> Result<Vec<AuditEntry>, String> {
    let limit = limit.min(MAX_LIMIT);

    // Build query with filter condition
    let sql = if let Some(f) = filter {
        format!(
            "SELECT id, timestamp, action, detail FROM audit_log WHERE action = '{}' LIMIT {} OFFSET {}",
            f, limit, offset
        )
    } else {
        format!(
            "SELECT id, timestamp, action, detail FROM audit_log LIMIT {} OFFSET {}",
            limit, offset
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([], |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                action: row.get(2)?,
                detail: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}
