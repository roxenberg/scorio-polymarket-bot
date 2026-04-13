/**
 * Preflight checks — validate all required config before starting.
 * Tells the user exactly what's missing and how to fix it.
 */

import { CONFIG, c } from './config.js';

interface Check {
    readonly name: string;
    readonly value: string;
    readonly required: boolean;
    readonly hint: string;
}

export function preflight(mode: 'scan' | 'trade' | 'paper'): boolean {
    const checks: Check[] = [
        // Always required
        {
            name: 'SCORIO_API_KEY or SCORIO_DEBUG_SECRET',
            value: CONFIG.SCORIO_API_KEY || CONFIG.SCORIO_DEBUG_SECRET,
            required: true,
            hint: 'Subscribe at https://rapidapi.com/scorio-scorio-default/api/scorio\n         Or set SCORIO_DEBUG_HOST + SCORIO_DEBUG_SECRET for direct access.',
        },
        {
            name: 'OPENAI_API_KEY',
            value: CONFIG.OPENAI_API_KEY,
            required: false,
            hint: 'Get one at https://platform.openai.com — needed for AI decisions.\n         Bot will still scan without it, but won\'t evaluate opportunities.',
        },
    ];

    // Trade mode requires wallet
    if (mode === 'trade') {
        checks.push(
            {
                name: 'PROXY_WALLET',
                value: CONFIG.PROXY_WALLET,
                required: true,
                hint: 'Your Polymarket wallet address (0x...). Sign up at https://polymarket.com',
            },
            {
                name: 'PRIVATE_KEY',
                value: CONFIG.PRIVATE_KEY,
                required: true,
                hint: 'Wallet private key (no 0x prefix). Export from MetaMask or your wallet.',
            },
            {
                name: 'RPC_URL',
                value: CONFIG.RPC_URL,
                required: true,
                hint: 'Polygon RPC endpoint. Get a free one at https://alchemy.com',
            },
        );
    }

    console.log(c.gray('\n  Preflight checks:\n'));

    let hasError = false;
    let hasWarning = false;

    for (const check of checks) {
        if (check.value) {
            const masked = check.name.includes('KEY') || check.name.includes('SECRET') || check.name.includes('PRIVATE')
                ? check.value.slice(0, 6) + '...' + check.value.slice(-4)
                : check.value.slice(0, 30) + (check.value.length > 30 ? '...' : '');
            console.log(`  ${c.green('✓')} ${check.name}: ${c.gray(masked)}`);
        } else if (check.required) {
            console.log(`  ${c.red('✗')} ${check.name}: ${c.red('MISSING')}`);
            console.log(`         ${c.gray(check.hint)}`);
            hasError = true;
        } else {
            console.log(`  ${c.yellow('○')} ${check.name}: ${c.yellow('not set (optional)')}`);
            console.log(`         ${c.gray(check.hint)}`);
            hasWarning = true;
        }
    }

    // Validate Scorio config consistency
    if (CONFIG.SCORIO_DEBUG_HOST && !CONFIG.SCORIO_DEBUG_SECRET) {
        console.log(`\n  ${c.red('✗')} SCORIO_DEBUG_HOST is set but SCORIO_DEBUG_SECRET is missing`);
        hasError = true;
    }

    // DRY_RUN warning
    if (mode === 'trade' && CONFIG.DRY_RUN) {
        console.log(`\n  ${c.yellow('⚠')} DRY_RUN=true — no real trades will be placed.`);
        console.log(`         ${c.gray('Set DRY_RUN=false in .env to enable live trading.')}`);
        hasWarning = true;
    }

    if (mode === 'trade' && !CONFIG.DRY_RUN) {
        console.log(`\n  ${c.red('⚠')} LIVE TRADING MODE — real money will be spent.`);
        console.log(`         ${c.gray(`Max trade size: $${CONFIG.MAX_TRADE_SIZE}`)}`);
    }

    console.log('');

    if (hasError) {
        console.log(c.red('  Preflight FAILED. Fix the errors above and try again.\n'));
        return false;
    }

    if (hasWarning) {
        console.log(c.yellow('  Preflight passed with warnings.\n'));
    } else {
        console.log(c.green('  Preflight OK.\n'));
    }

    return true;
}
