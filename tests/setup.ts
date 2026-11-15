// Loaded before tests: lib/gemini constructs a client at import time and needs a key.
// Tests never call the real API (embedBatch is always injected).
process.env.GEMINI_API_KEY ??= "test-key-not-used";
