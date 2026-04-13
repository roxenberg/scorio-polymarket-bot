import { CONFIG } from './config.js';

/**
 * Polymarket fee calculation.
 * Formula: fee = shares × feeRate × price × (1 - price)
 * Source: https://docs.polymarket.com/trading/fees
 *
 * Maker (GTC/GTD): always 0%.
 * Taker (FOK/FAK): category-dependent.
 * Sell: 0%.
 */

export function calcTakerFee(price: number, shares: number, category: string): number {
    const rate = CONFIG.FEE_RATES[category] ?? 0.05;
    return shares * rate * price * (1 - price);
}

export interface RoiBreakdown {
    readonly shares: number;
    readonly costBasis: number;
    readonly fee: number;
    readonly payout: number;
    readonly profit: number;
    readonly roiPct: number;
    readonly netRoiPct: number;
}

export function calcNetRoi(entryPrice: number, amount: number, category: string): RoiBreakdown {
    const shares = amount / entryPrice;
    const costBasis = amount;
    const fee = calcTakerFee(entryPrice, shares, category);
    const payout = shares;
    const profit = payout - costBasis - fee;
    const roiPct = ((1 / entryPrice) - 1) * 100;
    const netRoiPct = (profit / costBasis) * 100;
    return { shares, costBasis, fee, payout, profit, roiPct, netRoiPct };
}

export function impliedProb(decimalOdds: number): number {
    return decimalOdds <= 1 ? 1 : 1 / decimalOdds;
}
