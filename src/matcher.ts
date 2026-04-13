/**
 * Fuzzy game matcher: Scorio ↔ Polymarket.
 * Matches by team name similarity (Jaccard + substring containment).
 */

// ── Types ─────────────────────────────────────────────────────

export interface PolyMarket {
    readonly question: string;
    readonly slug: string;
    readonly outcomes: readonly string[];
    readonly prices: readonly number[];
    readonly tokenIds: readonly string[];
    readonly conditionId: string;
    readonly volume24hr: number;
    readonly liquidity: number;
    readonly endDate: string;
    readonly category: string;
}

export interface ScorioOutcome {
    readonly name: string;
    readonly price: number;
    readonly is_suspended: boolean;
}

export interface ScorioMarket {
    readonly name: string;
    readonly type: string;
    readonly outcomes: readonly ScorioOutcome[];
}

export interface ScorioGame {
    readonly id: string;
    readonly home_team: string;
    readonly away_team: string;
    readonly status: string;
    readonly score_text: string;
    readonly sport_id: string;
    readonly sport_name: string;
    readonly markets: readonly ScorioMarket[];
}

export interface MatchedPair {
    readonly scorio: ScorioGame;
    readonly poly: PolyMarket;
    readonly homeOutcomeIdx: number;
    readonly awayOutcomeIdx: number;
}

// ── Normalization ─────────────────────────────────────────────

const NOISE_WORDS = /\b(fc|sc|team|esports?|gaming|challengers?|youth|wom|women|woman)\b/g;

export function normalize(name: string): string {
    return name
        .toLowerCase()
        .replace(NOISE_WORDS, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenize(name: string): ReadonlySet<string> {
    return new Set(normalize(name).split(' ').filter(w => w.length > 1));
}

export function similarity(a: string, b: string): number {
    const tokA = tokenize(a);
    const tokB = tokenize(b);
    if (tokA.size === 0 || tokB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokA) {
        if (tokB.has(t)) intersection++;
    }

    const union = new Set([...tokA, ...tokB]);
    return intersection / union.size;
}

export function containsMatch(scorioName: string, polyName: string): boolean {
    const sn = normalize(scorioName);
    const pn = normalize(polyName);
    if (sn.length < 3 || pn.length < 3) return false;
    return sn.includes(pn) || pn.includes(sn);
}

// ── Category detection ────────────────────────────────────────

const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
    [/counter-strike|cs2|csgo|lol|dota|valorant|league of legends|mobile legends/i, 'culture'],
    [/nba|nfl|mlb|nhl|ufc|boxing|tennis|atp|wta|cricket|ipl|f1|formula|football|soccer/i, 'sports'],
];

export function detectCategory(question: string): string {
    for (const [pattern, category] of CATEGORY_RULES) {
        if (pattern.test(question)) return category;
    }
    return 'other';
}

// ── Matching ──────────────────────────────────────────────────

export function matchGames(scorioGames: readonly ScorioGame[], polyMarkets: readonly PolyMarket[]): MatchedPair[] {
    const pairs: MatchedPair[] = [];

    for (const sg of scorioGames) {
        for (const pm of polyMarkets) {
            let homeIdx = -1;
            let awayIdx = -1;

            for (let i = 0; i < pm.outcomes.length; i++) {
                const outcome = pm.outcomes[i]!;
                const simHome = Math.max(similarity(sg.home_team, outcome), containsMatch(sg.home_team, outcome) ? 0.8 : 0);
                const simAway = Math.max(similarity(sg.away_team, outcome), containsMatch(sg.away_team, outcome) ? 0.8 : 0);

                if (simHome >= 0.5 && simHome > simAway) homeIdx = i;
                if (simAway >= 0.5 && simAway > simHome) awayIdx = i;
            }

            if (homeIdx >= 0 || awayIdx >= 0) {
                pairs.push({ scorio: sg, poly: pm, homeOutcomeIdx: homeIdx, awayOutcomeIdx: awayIdx });
            }
        }
    }

    return pairs;
}
