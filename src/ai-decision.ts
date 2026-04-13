/**
 * AI Decision Engine — evaluates sports/esports opportunities
 * using bookmaker odds cross-reference from Scorio.
 */

import OpenAI from 'openai';
import { CONFIG, c } from './config.js';

export interface Opportunity {
    readonly scorioGameId: string;
    readonly polySlug: string;
    readonly polyTokenId: string;
    readonly question: string;
    readonly outcomeName: string;
    readonly scorioOdds: number;
    readonly scorioImplied: number;
    readonly polyPrice: number;
    readonly edgePct: number;
    readonly netEdgePct: number;
    readonly volume24hr: number;
    readonly liquidity: number;
    readonly scoreText: string;
    readonly gameStatus: string;
    readonly category: string;
    readonly scorioHome: string;
    readonly scorioAway: string;
    readonly signalType: 'scorio';
}

export interface AIDecision {
    readonly action: 'BUY' | 'SKIP';
    readonly confidence: number;
    readonly size_usd: number;
    readonly reasoning: string;
}

export async function evaluateOpportunity(opp: Opportunity): Promise<AIDecision | null> {
    if (!CONFIG.OPENAI_API_KEY) return null;

    const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

    const prompt = `You are a sports prediction market analyst. Evaluate this opportunity.

MATCH: ${opp.scorioHome} vs ${opp.scorioAway}
OUTCOME TO BUY: "${opp.outcomeName}"

DATA:
- Bookmaker odds: ${opp.scorioOdds} (implied: ${(opp.scorioImplied * 100).toFixed(1)}%)
- Polymarket price: $${opp.polyPrice.toFixed(4)} (${(opp.polyPrice * 100).toFixed(1)}%)
- Bookmaker edge: ${opp.edgePct.toFixed(1)}%
- Net edge after fees: ${opp.netEdgePct.toFixed(1)}%
- Game status: ${opp.gameStatus}
- Score: ${opp.scoreText || 'not started'}
- Volume 24h: $${opp.volume24hr.toFixed(0)}
- Liquidity: $${opp.liquidity.toFixed(0)}
- Category: ${opp.category} (fee: ${((CONFIG.FEE_RATES[opp.category] ?? 0.05) * 100).toFixed(1)}%)

RULES:
- Bookmaker odds (BetConstruct) are sharp — billions in volume
- Min confidence to BUY: 0.75. Max size: $${CONFIG.MAX_TRADE_SIZE}
- Live games with big leads are safer than prematch
- Edge < 2% after fees = not worth it

Respond ONLY valid JSON:
{"action":"BUY"|"SKIP","confidence":0.0-1.0,"size_usd":0-${CONFIG.MAX_TRADE_SIZE},"reasoning":"one sentence"}`;

    try {
        const resp = await openai.chat.completions.create({
            model: CONFIG.OPENAI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_completion_tokens: 200,
        });

        const raw = resp.choices[0]?.message?.content?.trim() ?? '';
        return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '')) as AIDecision;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(c.red(`  AI error: ${message.slice(0, 80)}`));
        return null;
    }
}
