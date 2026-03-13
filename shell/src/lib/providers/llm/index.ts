/**
 * LLM provider auto-registration.
 * Import this file to populate the registry with all LLM providers.
 */

// Core providers (API keys verified in .env)
import "./nextain";
import "./claude-code-cli";
import "./gemini";
import "./openai";
import "./anthropic";
import "./xai";
import "./zai";

// Local / self-hosted
import "./ollama";
