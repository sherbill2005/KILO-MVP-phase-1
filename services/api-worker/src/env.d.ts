/// <reference types="@cloudflare/workers-types" />

export interface Env { 
    KILO_KV: KVNamespace;
    GEMINI_API_KEY: string;
    GEMINI_MODEL?: string;
    GEMINI_LIVE_MODEL?: string;
}
