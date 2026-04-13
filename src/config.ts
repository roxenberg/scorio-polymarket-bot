import 'dotenv/config';

export interface FeeRates {
    readonly [category: string]: number;
}

export const CONFIG = {
    // Polymarket
    PROXY_WALLET: process.env.PROXY_WALLET ?? '',
    PRIVATE_KEY: process.env.PRIVATE_KEY ?? '',
    CLOB_HTTP_URL: 'https://clob.polymarket.com/',
    RPC_URL: process.env.RPC_URL ?? '',
    USDC_CONTRACT_ADDRESS: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e on Polygon — universal, never changes
    GAMMA_API: 'https://gamma-api.polymarket.com',

    // Scorio — production (RapidAPI)
    SCORIO_API_KEY: process.env.SCORIO_API_KEY ?? '',
    SCORIO_API_HOST: process.env.SCORIO_API_HOST ?? 'scorio.p.rapidapi.com',

    // Scorio — debug (direct)
    SCORIO_DEBUG_HOST: process.env.SCORIO_DEBUG_HOST ?? '',
    SCORIO_DEBUG_SECRET: process.env.SCORIO_DEBUG_SECRET ?? '',
    SCORIO_DEBUG_PLAN: (process.env.SCORIO_DEBUG_PLAN ?? '') as 'free' | 'starter' | 'pro' | 'business' | '',

    // OpenAI
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-5.4',

    // MongoDB
    MONGO_URI: process.env.MONGO_URI ?? 'mongodb://localhost:27017/scorio_polymarket',

    // Trading
    MAX_TRADE_SIZE: parseFloat(process.env.MAX_TRADE_SIZE ?? '10'),
    MIN_EDGE_PCT: parseFloat(process.env.MIN_EDGE_PCT ?? '2.0'),
    SCAN_INTERVAL_S: parseInt(process.env.SCAN_INTERVAL_S ?? '60', 10),
    DRY_RUN: process.env.DRY_RUN !== 'false',

    // Fee rates (verified: docs.polymarket.com/trading/fees, April 2026)
    FEE_RATES: {
        sports: 0.03,
        culture: 0.05,  // esports
    } as FeeRates,
} as const;

export const POLY_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; ScorioPolyBot/2.0)',
    'Accept': 'application/json',
};

export const c = {
    cyan:    (t: string) => `\x1b[36m${t}\x1b[0m`,
    green:   (t: string) => `\x1b[32m${t}\x1b[0m`,
    red:     (t: string) => `\x1b[31m${t}\x1b[0m`,
    yellow:  (t: string) => `\x1b[33m${t}\x1b[0m`,
    bold:    (t: string) => `\x1b[1m${t}\x1b[0m`,
    gray:    (t: string) => `\x1b[90m${t}\x1b[0m`,
    magenta: (t: string) => `\x1b[35m${t}\x1b[0m`,
} as const;
