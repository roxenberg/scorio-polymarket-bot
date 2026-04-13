/**
 * Polymarket API — market discovery + order execution.
 */

import { ethers } from 'ethers';
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { CONFIG, POLY_HEADERS, c } from './config.js';
import { detectCategory, type PolyMarket } from './matcher.js';

// ── Market discovery ──────────────────────────────────────────

interface FetchOptions {
    readonly matchOnly?: boolean;
    readonly maxHours?: number;
}

export async function fetchMarkets(opts: FetchOptions = {}): Promise<PolyMarket[]> {
    const { matchOnly = false, maxHours = 168 } = opts;
    const markets: PolyMarket[] = [];
    const now = Date.now();

    for (let offset = 0; offset < 500; offset += 100) {
        try {
            const params = new URLSearchParams({
                active: 'true', closed: 'false', limit: '100',
                offset: String(offset), order: 'volume24hr', ascending: 'false',
            });
            const resp = await fetch(`${CONFIG.GAMMA_API}/markets?${params}`, {
                headers: POLY_HEADERS,
                signal: AbortSignal.timeout(15000),
            });
            if (!resp.ok) break;
            const data = await resp.json() as Record<string, unknown>[];
            if (!data?.length) break;

            for (const m of data) {
                const q = String(m.question ?? '');
                const slug = String(m.slug ?? '');
                if (/updown-(5m|15m|1h)/.test(slug)) continue;

                const outcomes: string[] = JSON.parse(String(m.outcomes ?? '[]'));
                if (matchOnly) {
                    if (outcomes.length === 2 && outcomes[0] === 'Yes' && outcomes[1] === 'No') continue;
                    if (!/ vs\.? /i.test(q)) continue;
                }

                const prices: number[] = JSON.parse(String(m.outcomePrices ?? '[]')).map(Number);
                const tokenIds: string[] = m.clobTokenIds ? JSON.parse(String(m.clobTokenIds)) : [];
                const vol = parseFloat(String(m.volume24hr ?? '0'));
                if (vol < 2000) continue;

                if (!prices.some(p => p >= 0.80 && p <= 0.98)) continue;

                const endDate = String(m.endDate ?? '');
                if (endDate) {
                    const hours = (new Date(endDate).getTime() - now) / 3600000;
                    if (hours > maxHours || hours < 0) continue;
                }

                markets.push({
                    question: q, slug, outcomes, prices, tokenIds,
                    conditionId: String(m.conditionId ?? ''), volume24hr: vol,
                    liquidity: parseFloat(String(m.liquidity ?? '0')), endDate,
                    category: detectCategory(q),
                });
            }
        } catch { break; }
    }
    return markets;
}

// ── CLOB client ───────────────────────────────────────────────

export async function createClobClient(): Promise<ClobClient> {
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const code = await provider.getCode(CONFIG.PROXY_WALLET);
    const isProxy = code !== '0x';
    const sigType = isProxy ? SignatureType.POLY_PROXY : SignatureType.EOA;

    let client = new ClobClient(CONFIG.CLOB_HTTP_URL, 137, wallet, undefined, sigType, isProxy ? CONFIG.PROXY_WALLET : undefined);

    const origLog = console.log;
    const origErr = console.error;
    console.log = () => {};
    console.error = () => {};
    let creds = await client.createApiKey();
    if (!creds.key) creds = await client.deriveApiKey();
    console.log = origLog;
    console.error = origErr;

    return new ClobClient(CONFIG.CLOB_HTTP_URL, 137, wallet, creds, sigType, isProxy ? CONFIG.PROXY_WALLET : undefined);
}

// ── Balance ───────────────────────────────────────────────────

export async function getBalance(): Promise<number> {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const usdc = new ethers.Contract(CONFIG.USDC_CONTRACT_ADDRESS,
        ['function balanceOf(address) view returns (uint256)'], provider);
    const bal = await usdc.balanceOf(CONFIG.PROXY_WALLET);
    return bal.toNumber() / 1e6;
}

// ── Trade execution ───────────────────────────────────────────

interface TradeResult {
    readonly success: boolean;
    readonly price: number;
    readonly shares: number;
    readonly error?: string;
}

export async function executeTrade(tokenId: string, amount: number, maxPrice: number): Promise<TradeResult> {
    if (CONFIG.DRY_RUN) {
        console.log(c.yellow(`  [DRY RUN] Would buy $${amount} of ${tokenId.slice(0, 20)}...`));
        return { success: true, price: maxPrice, shares: amount / maxPrice };
    }

    const client = await createClobClient();
    const orderBook = await client.getOrderBook(tokenId);

    if (!orderBook.asks?.length) {
        return { success: false, price: 0, shares: 0, error: 'No asks' };
    }

    const bestAsk = orderBook.asks.reduce((min, ask) =>
        parseFloat(ask.price) < parseFloat(min.price) ? ask : min, orderBook.asks[0]!);
    const price = parseFloat(bestAsk.price);

    if (price > maxPrice) {
        return { success: false, price, shares: 0, error: `Ask $${price} > max $${maxPrice}` };
    }

    const signedOrder = await client.createMarketOrder({
        side: Side.BUY, tokenID: tokenId, amount, price,
    });
    const resp = await client.postOrder(signedOrder, OrderType.FOK);

    return resp.success
        ? { success: true, price, shares: amount / price }
        : { success: false, price, shares: 0, error: JSON.stringify(resp).slice(0, 100) };
}
