use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Agent's semantic Fact — matches agent/src/memory/types.ts Fact interface
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentFact {
    pub id: String,
    pub content: String,
    #[serde(default)]
    pub entities: Vec<String>,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub importance: f64,
    #[serde(default)]
    pub recall_count: i64,
    #[serde(default)]
    pub last_accessed: i64,
    #[serde(default)]
    pub strength: f64,
    #[serde(default)]
    pub source_episodes: Vec<String>,
}

/// On-disk JSON schema (matches LocalAdapter's MemoryStore)
#[derive(Debug, Deserialize)]
struct MemoryStore {
    #[serde(default)]
    facts: Vec<AgentFact>,
}

/// Get the Agent memory JSON file path (~/.naia/memory/alpha-memory.json)
fn agent_memory_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".naia")
        .join("memory")
        .join("alpha-memory.json")
}

/// Read all facts from Agent's memory JSON file.
/// Returns empty vec if file doesn't exist or is invalid.
pub fn get_all_agent_facts() -> Vec<AgentFact> {
    let path = agent_memory_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<MemoryStore>(&content) {
            Ok(store) => store.facts,
            Err(_) => Vec::new(),
        },
        Err(_) => Vec::new(),
    }
}

/// Delete a fact from Agent's memory JSON file by ID.
/// Returns true if the fact was found and deleted.
///
/// RACE NOTE: Agent (Node.js) also writes this file during consolidation (30-min cycle)
/// and recall (recallCount updates). Both sides use atomic write (tmp+rename).
/// No cross-process file lock exists — a lost update is theoretically possible if
/// Agent writes during the read-modify-write window here. In practice this is rare
/// because user-initiated deletes are infrequent and consolidation runs every 30 min.
/// Future: route deletes through Agent IPC to eliminate this race entirely.
pub fn delete_agent_fact(fact_id: &str) -> Result<bool, String> {
    let path = agent_memory_path();
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read memory file: {}", e))?;

    let mut raw: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse memory JSON: {}", e))?;

    let facts = raw
        .get_mut("facts")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| "No facts array in memory file".to_string())?;

    let original_len = facts.len();
    facts.retain(|f| f.get("id").and_then(|v| v.as_str()) != Some(fact_id));
    let deleted = facts.len() < original_len;

    if deleted {
        // Atomic write: write to tmp, then rename
        let tmp_path = path.with_extension("json.tmp");
        let serialized = serde_json::to_string_pretty(&raw)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(&tmp_path, &serialized)
            .map_err(|e| format!("Failed to write tmp file: {}", e))?;
        std::fs::rename(&tmp_path, &path)
            .map_err(|e| format!("Failed to rename tmp file: {}", e))?;
    }

    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn parse_agent_memory_json() {
        let content = r#"{
            "version": 1,
            "facts": [
                {
                    "id": "f1",
                    "content": "User prefers TypeScript",
                    "entities": ["TypeScript"],
                    "topics": ["preference"],
                    "createdAt": 1000,
                    "updatedAt": 1000,
                    "importance": 0.8,
                    "recallCount": 2,
                    "lastAccessed": 2000,
                    "strength": 0.7,
                    "sourceEpisodes": ["ep1"]
                }
            ],
            "episodes": [],
            "skills": [],
            "reflections": [],
            "associations": {}
        }"#;
        let store: MemoryStore = serde_json::from_str(content).unwrap();
        assert_eq!(store.facts.len(), 1);
        assert_eq!(store.facts[0].id, "f1");
        assert_eq!(store.facts[0].content, "User prefers TypeScript");
        assert_eq!(store.facts[0].entities, vec!["TypeScript"]);
        assert_eq!(store.facts[0].importance, 0.8);
    }

    #[test]
    fn empty_file_returns_empty_facts() {
        let content = r#"{"version": 1, "episodes": [], "skills": [], "reflections": [], "associations": {}}"#;
        let store: MemoryStore = serde_json::from_str(content).unwrap();
        assert!(store.facts.is_empty());
    }
}
