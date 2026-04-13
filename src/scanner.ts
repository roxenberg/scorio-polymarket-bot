/**
 * Live Scanner — Scorio ↔ Polymarket Sports Edge Finder.
 *
 * Pipeline:
 *   1. Preflight checks
 *   2. Fetch live + upcoming games from Scorio
 *   3. Fetch active sports/esports markets from Polymarket
 *   4. Fuzzy-match games between platforms
 *   5. Calculate edge (bookmaker implied vs Polymarket price)
 *   6. AI decision engine evaluates each opportunity
 *
 * Usage:
 *   npm run build && npm run scan
 *   npm run build && npm run scan:loop
 */

import { CONFIG, c } from './config.js';
import { preflight } from './preflight.js';
import { fetchLiveGames, searchForPolymarketTeams } from './scorio.js';
import { fetchMarkets } from './polymarket.js';
import { matchGames, similarity, containsMatch, type ScorioGame } from './matcher.js';
import { impliedProb, calcTakerFee } from './fees.js';
import { evaluateOpportunity, type Opportunity } from './ai-decision.js';

async function scan(): Promise<Opportunity[]> {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(c.cyan(`\n[${ts}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    console.log(c.bold(c.cyan(`[${ts}]   LIVE SCANNER — Scorio ↔ Polymarket`)));
    console.log(c.cyan(`[${ts}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));

    // Step 1: Fetch Scorio
    console.log(c.gray('  Fetching Scorio live games...'));
    let scorioGames: ScorioGame[] = [];
    try {
        scorioGames = await fetchLiveGames();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(c.red(`  Scorio error: ${msg.slice(0, 80)}`));
    }
    console.log(c.gray(`  Fetched ${scorioGames.length} Scorio games`));

    // Step 2: Fetch Polymarket
    console.log(c.gray('  Fetching Polymarket sports/esports markets...'));
    const matchMarkets = await fetchMarkets({ matchOnly: true });
    console.log(c.gray(`  Fetched ${matchMarkets.length} match markets\n`));

    // Step 2.5: Targeted search — find Polymarket teams on Scorio (catches prematch)
    const teamNames = matchMarkets.flatMap(m => m.outcomes.filter(o => o !== 'Yes' && o !== 'No'));
    if (teamNames.length > 0) {
        console.log(c.gray(`  Searching Scorio for ${teamNames.length} Polymarket teams...`));
        const targeted = await searchForPolymarketTeams(teamNames);
        const existingIds = new Set(scorioGames.map(g => g.id));
        let added = 0;
        for (const g of targeted) {
            if (!existingIds.has(g.id)) {
                scorioGames.push(g);
                existingIds.add(g.id);
                added++;
            }
        }
        if (added > 0) console.log(c.gray(`  Found ${added} additional games via targeted search`));
    }

    // Step 3: Match games
    const pairs = matchGames(scorioGames, matchMarkets);
    console.log(c.bold(`  Matched ${pairs.length} game pairs`));
    for (const p of pairs) {
        console.log(c.gray(`    ${p.scorio.home_team} vs ${p.scorio.away_team}  ↔  ${p.poly.question.slice(0, 55)}`));
    }

    // Step 4: Find opportunities
    const opportunities: Opportunity[] = [];

    for (const pair of pairs) {
        const { scorio: sg, poly: pm } = pair;
        const winnerMarket = sg.markets.find(m =>
            /match winner|match result|^P1P2$|^P1XP2$/i.test(m.name) || m.type === 'P1P2' || m.type === 'P1XP2'
        );
        if (!winnerMarket) continue;

        for (const so of winnerMarket.outcomes) {
            if (so.is_suspended) continue;
            const imp = impliedProb(so.price);
            if (imp < 0.85) continue;

            let polyIdx = -1;
            if ((so.name === 'W1' || so.name === '1') && pair.homeOutcomeIdx >= 0) polyIdx = pair.homeOutcomeIdx;
            if ((so.name === 'W2' || so.name === '2') && pair.awayOutcomeIdx >= 0) polyIdx = pair.awayOutcomeIdx;
            if (polyIdx < 0 && !['W1', 'W2', '1', '2', 'X'].includes(so.name)) {
                for (let i = 0; i < pm.outcomes.length; i++) {
                    if (similarity(so.name, pm.outcomes[i]!) >= 0.5 || containsMatch(so.name, pm.outcomes[i]!)) {
                        polyIdx = i;
                        break;
                    }
                }
            }
            if (polyIdx < 0) continue;

            const polyPrice = pm.prices[polyIdx]!;
            const polyTokenId = pm.tokenIds[polyIdx] ?? '';
            if (!polyTokenId || polyPrice > 0.98 || polyPrice < 0.50) continue;

            const edgePct = (imp - polyPrice) * 100;
            const shares = 10 / polyPrice;
            const fee = calcTakerFee(polyPrice, shares, pm.category);
            const netEdgePct = ((shares * (1 - polyPrice) - fee) / (polyPrice * shares)) * 100;

            if (edgePct >= CONFIG.MIN_EDGE_PCT) {
                opportunities.push({
                    scorioGameId: sg.id, polySlug: pm.slug, polyTokenId,
                    question: pm.question, outcomeName: pm.outcomes[polyIdx]!,
                    scorioOdds: so.price, scorioImplied: imp, polyPrice,
                    edgePct, netEdgePct, volume24hr: pm.volume24hr, liquidity: pm.liquidity,
                    scoreText: sg.score_text, gameStatus: sg.status,
                    category: pm.category, scorioHome: sg.home_team, scorioAway: sg.away_team,
                    signalType: 'scorio',
                });
            }
        }
    }

    // Step 5: Display
    opportunities.sort((a, b) => b.edgePct - a.edgePct);
    console.log('');

    if (opportunities.length === 0) {
        console.log(c.yellow('  No opportunities found.\n'));
        console.log(c.gray(`  ${pairs.length} matched games, but no edge > ${CONFIG.MIN_EDGE_PCT}%.`));
        console.log(c.gray('  Edges appear when live odds shift — keep scanning.\n'));
    } else {
        console.log(c.bold(c.green(`  ${opportunities.length} OPPORTUNITIES:\n`)));
        for (const o of opportunities) {
            const color = o.edgePct >= 5 ? c.green : o.edgePct >= 3 ? c.cyan : c.yellow;
            console.log(
                `  ${color(o.edgePct.toFixed(1) + '%')} ` +
                `net=${o.netEdgePct.toFixed(1)}% ` +
                `Scorio ${(o.scorioImplied * 100).toFixed(0)}% vs Poly $${o.polyPrice.toFixed(3)} ` +
                `${o.outcomeName}: ${o.question.slice(0, 45)}`
            );
            console.log(c.gray(`        ${o.scorioHome} vs ${o.scorioAway} | ${o.scoreText || 'prematch'} | vol=$${(o.volume24hr / 1000).toFixed(0)}k liq=$${(o.liquidity / 1000).toFixed(0)}k`));
        }
    }

    // Step 6: AI decisions
    if (opportunities.length > 0 && CONFIG.OPENAI_API_KEY) {
        console.log(c.magenta(`\n  ┌─ AI DECISION ENGINE (${CONFIG.OPENAI_MODEL}) ──────────`));
        for (const opp of opportunities.slice(0, 8)) {
            const decision = await evaluateOpportunity(opp);
            if (!decision) continue;
            const icon = decision.action === 'BUY' ? c.green('BUY') : c.yellow('SKIP');
            console.log(c.magenta('  │'));
            console.log(c.magenta('  │ ') + `${icon} ${(decision.confidence * 100).toFixed(0)}% $${decision.size_usd}  ${opp.outcomeName}: ${opp.question.slice(0, 45)}`);
            console.log(c.magenta('  │ ') + c.gray(decision.reasoning));
        }
        console.log(c.magenta('  └────────────────────────────────────────\n'));
    }

    console.log(c.gray(`  Next scan in ${CONFIG.SCAN_INTERVAL_S}s\n`));
    return opportunities;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const loop = args.includes('--loop');

    if (!preflight('scan')) process.exit(1);

    if (loop) {
        console.log(c.bold(`  Loop mode (${CONFIG.SCAN_INTERVAL_S}s interval)\n`));
        while (true) {
            try { await scan(); } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(c.red(`  Error: ${msg}`));
            }
            await new Promise(r => setTimeout(r, CONFIG.SCAN_INTERVAL_S * 1000));
        }
    } else {
        await scan();
    }
}

export default scan;
main().catch(console.error);
