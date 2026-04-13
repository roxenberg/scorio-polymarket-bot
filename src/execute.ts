/**
 * Trade execution — batch or single.
 */

import { CONFIG, c } from './config.js';
import { preflight } from './preflight.js';
import { executeTrade, getBalance } from './polymarket.js';
import { calcNetRoi } from './fees.js';

interface TradeOrder {
    readonly name: string;
    readonly tokenId: string;
    readonly outcome: string;
    readonly amount: number;
    readonly maxPrice: number;
    readonly category: string;
    readonly aiConfidence: string;
}

export async function executeBatch(orders: readonly TradeOrder[]): Promise<void> {
    console.log(c.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(c.bold(c.cyan('  TRADE EXECUTION')));
    console.log(c.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    const balance = await getBalance();
    const totalNeeded = orders.reduce((s, o) => s + o.amount, 0);
    console.log(`  Balance: $${balance.toFixed(2)}  |  Needed: $${totalNeeded}  |  Mode: ${CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

    if (balance < totalNeeded && !CONFIG.DRY_RUN) {
        console.log(c.red('  Insufficient balance.'));
        return;
    }

    let filled = 0;
    let totalProfit = 0;

    for (const order of orders) {
        const roi = calcNetRoi(order.maxPrice, order.amount, order.category);
        console.log(`  ${order.outcome}: ${order.name.slice(0, 50)}`);
        console.log(c.gray(`    AI: ${order.aiConfidence} | $${order.amount} | ROI: ${roi.netRoiPct.toFixed(1)}%`));

        const result = await executeTrade(order.tokenId, order.amount, order.maxPrice);

        if (result.success) {
            console.log(c.green(`    FILLED ${result.shares.toFixed(2)} shares @ $${result.price.toFixed(4)}\n`));
            filled++;
            totalProfit += result.shares * (1 - result.price);
        } else {
            console.log(c.red(`    FAILED: ${result.error}\n`));
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(c.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(`  Filled: ${filled}/${orders.length}  |  Expected profit: $${totalProfit.toFixed(2)}`);
    console.log(c.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

async function main(): Promise<void> {
    if (!preflight('trade')) process.exit(1);
    console.log('  Pass trades via import { executeBatch } or extend this file.');
}

main().catch(console.error);
