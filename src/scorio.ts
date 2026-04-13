/**
 * Scorio API client via @scorio/client-sdk.
 * Production: RapidAPI auth (X-RapidAPI-Key).
 * Debug: direct access (x-rapidapi-proxy-secret).
 *
 * Subscribe: https://rapidapi.com/scorio-scorio-default/api/scorio
 */

import ScorioSDK from '@scorio/client-sdk';
import type { Game, SportCount } from '@scorio/client-sdk';
import { CONFIG } from './config.js';
import type { ScorioGame, ScorioMarket, ScorioOutcome } from './matcher.js';

let sdk: ScorioSDK | null = null;

function getSdk(): ScorioSDK {
    if (sdk) return sdk;

    if (CONFIG.SCORIO_DEBUG_HOST && CONFIG.SCORIO_DEBUG_SECRET) {
        sdk = new ScorioSDK({
            apiKey: 'debug',
            host: CONFIG.SCORIO_API_HOST,
            debug: {
                host: CONFIG.SCORIO_DEBUG_HOST.replace(/^https?:\/\//, ''),
                secret: CONFIG.SCORIO_DEBUG_SECRET,
                plan: (CONFIG.SCORIO_DEBUG_PLAN || 'business') as 'business',
            },
        });
    } else {
        if (!CONFIG.SCORIO_API_KEY) {
            throw new Error('SCORIO_API_KEY required — get one at https://rapidapi.com/scorio-scorio-default/api/scorio');
        }
        sdk = new ScorioSDK({
            apiKey: CONFIG.SCORIO_API_KEY,
            host: CONFIG.SCORIO_API_HOST,
        });
    }

    return sdk;
}

function mapGame(g: Game, sportName: string): ScorioGame {
    return {
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        status: g.status,
        score_text: g.score_text,
        sport_id: g.sport_id,
        sport_name: sportName,
        markets: g.markets.map((m): ScorioMarket => ({
            name: m.name,
            type: m.type,
            outcomes: m.outcomes.map((o): ScorioOutcome => ({
                name: o.name,
                price: o.price,
                is_suspended: o.is_suspended,
            })),
        })),
    };
}

export async function fetchLiveGames(): Promise<ScorioGame[]> {
    const client = getSdk();
    const games: ScorioGame[] = [];

    const snapshot = await client.getLiveSnapshot();
    const sports = snapshot.data.sports;

    const sportNames = new Map<string, string>();
    for (const s of sports) sportNames.set(s.id, s.name);

    const liveSports = sports.filter(s => s.live_count > 0);

    for (const sport of liveSports) {
        try {
            const { data } = await client.getLiveGamesBySport(sport.id);
            for (const g of data) {
                games.push(mapGame(g, sport.name));
            }
        } catch { /* skip sport on error */ }
    }

    try {
        const { data } = await client.getGamesStartingSoon({ minutes: 120 });
        for (const g of data) {
            if (!games.some(x => x.id === g.id)) {
                games.push(mapGame(g, sportNames.get(g.sport_id ?? '') ?? 'Unknown'));
            }
        }
    } catch { /* starting-soon optional */ }

    return games;
}

export async function searchGame(query: string): Promise<ScorioGame[]> {
    const client = getSdk();
    const { data } = await client.searchGames(query, { limit: 5 });
    return data.map(g => mapGame(g, ''));
}

/**
 * Targeted search: for each Polymarket market, search Scorio by team name.
 * Catches prematch games that aren't in the live feed yet.
 */
export async function searchForPolymarketTeams(teamNames: readonly string[]): Promise<ScorioGame[]> {
    const client = getSdk();
    const found: ScorioGame[] = [];
    const seenIds = new Set<string>();

    for (const team of teamNames) {
        try {
            const { data } = await client.searchGames(team, { limit: 3 });
            for (const g of data) {
                if (!seenIds.has(g.id)) {
                    seenIds.add(g.id);
                    found.push(mapGame(g, ''));
                }
            }
        } catch { /* skip on error */ }
    }

    return found;
}
