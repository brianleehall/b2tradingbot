#!/usr/bin/env python3
"""
ORB (Opening Range Breakout) 12-Month Backtest
Simulates Brian's exact Lovable ORB configuration against historical data.

Uses Yahoo Finance hourly data as proxy for 5-min ORB.
The 9:30-10:30 AM hourly bar approximates the opening range.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import sys

# ============================================================
# CONFIGURATION — matches auto-trade/index.ts exactly
# ============================================================
CONFIG = {
    'STARTING_EQUITY': 93637,       # Brian's paper account
    'TIER1_RISK': 0.02,             # 2% risk on #1 stock
    'TIER1_AGGRESSIVE_RISK': 0.03,  # 3% in aggressive bull
    'TIER2_RISK': 0.01,             # 1% risk on #2-4
    'TARGET_R_MULTIPLE': 3,         # 3:1 reward:risk
    'MAX_TRADES_PER_DAY': 5,
    'MAX_DAILY_LOSS_PCT': 0.03,     # -3% daily stop
    'MIN_RVOL': 1.5,
    'MIN_CHANGE_PCT': 2.0,
    'MIN_PRICE': 5.0,
    'PREMARKET_COOLOFF_PCT': 8.0,
    'VIX_SHORTS_ONLY': 25,
    'VIX_AGGRESSIVE_BULL': 18,
}

# Stock universe — same as orb-stock-selector
SCAN_STOCKS = [
    'NVDA', 'AMD', 'SMCI', 'ARM', 'AVGO', 'MRVL', 'MU', 'INTC',
    'MARA', 'RIOT', 'MSTR', 'HUT', 'COIN', 'CLSK',
    'IONQ', 'RGTI', 'QUBT', 'SOUN', 'PLTR',
    'TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI',
    'AFRM', 'UPST', 'SOFI', 'HOOD',
    'PLUG', 'GSAT', 'META', 'AAPL', 'GOOGL', 'AMZN',
    'ORCL', 'CRM', 'NFLX', 'BA', 'DIS', 'JPM', 'GS', 'V', 'MA',
    'ABNB', 'UBER', 'SHOP', 'NET', 'DDOG', 'ZS',
]

FALLBACK_STOCKS = ['NVDA', 'TSLA', 'AMD', 'SMCI']


def download_data(symbols, period='1y'):
    """Download hourly data for all symbols + SPY + VIX."""
    all_symbols = list(set(symbols + ['SPY', '^VIX']))
    print(f"Downloading hourly data for {len(all_symbols)} symbols...")
    
    data = {}
    failed = []
    
    for i, sym in enumerate(all_symbols):
        try:
            ticker = yf.Ticker(sym)
            # 1h data available for ~730 days
            df = ticker.history(period=period, interval='1h')
            if len(df) > 50:
                data[sym] = df
                if (i + 1) % 10 == 0:
                    print(f"  Downloaded {i+1}/{len(all_symbols)}...")
            else:
                failed.append(sym)
        except Exception as e:
            failed.append(sym)
    
    print(f"Got data for {len(data)} symbols, {len(failed)} failed: {failed[:10]}")
    return data


def get_daily_bars(hourly_df):
    """Convert hourly bars to daily OHLCV."""
    daily = hourly_df.resample('D').agg({
        'Open': 'first',
        'High': 'max',
        'Low': 'min',
        'Close': 'last',
        'Volume': 'sum'
    }).dropna()
    return daily


def estimate_orb_range(hourly_df, date):
    """
    Estimate the 5-minute Opening Range from hourly data.
    Uses the 9:30 AM hourly bar. The ORB is typically 30-60% of the
    first hour's range for liquid stocks.
    """
    day_data = hourly_df[hourly_df.index.date == date.date()]
    if len(day_data) == 0:
        return None
    
    # First bar of the day (9:30 AM hour)
    first_bar = day_data.iloc[0]
    
    # The 5-min ORB is typically ~40-50% of the first hour's range
    # This is a well-documented relationship in market microstructure
    first_hour_range = first_bar['High'] - first_bar['Low']
    orb_range = first_hour_range * 0.45  # 45% of first hour
    
    mid = (first_bar['High'] + first_bar['Low']) / 2
    orb_high = mid + orb_range / 2
    orb_low = mid - orb_range / 2
    
    return {
        'high': orb_high,
        'low': orb_low,
        'range': orb_range,
        'open': first_bar['Open'],
        'first_hour_high': first_bar['High'],
        'first_hour_low': first_bar['Low'],
        'first_hour_volume': first_bar['Volume'],
    }


def calculate_spy_sma(spy_daily, date, period=200):
    """Calculate SPY SMA as of a given date."""
    prior = spy_daily[spy_daily.index.date <= date.date()]
    if len(prior) < period:
        return prior['Close'].mean() if len(prior) > 0 else 0
    return prior['Close'].tail(period).mean()


def select_stocks_for_day(all_data, date, lookback_days=5):
    """
    Simulate the orb-stock-selector: find stocks with RVOL >= 1.5 and
    price change >= 2% in the past 5 trading days.
    """
    qualified = []
    
    for sym in SCAN_STOCKS:
        if sym not in all_data:
            continue
        
        daily = get_daily_bars(all_data[sym])
        prior = daily[daily.index.date < date.date()]
        
        if len(prior) < 35:  # Need enough for 30-day avg + recent days
            continue
        
        # 30-day average volume (excluding last 5 days)
        avg_vol_30d = prior.iloc[:-5]['Volume'].tail(30).mean() if len(prior) > 5 else prior['Volume'].tail(30).mean()
        
        if avg_vol_30d < 800000:
            continue
        
        # Check last 5 trading days for qualifying move
        recent = prior.tail(min(lookback_days + 1, len(prior)))
        
        best_rvol = 0
        best_change = 0
        best_price = 0
        qualified_day = False
        
        for i in range(1, len(recent)):
            day_vol = recent.iloc[i]['Volume']
            prev_close = recent.iloc[i-1]['Close']
            close = recent.iloc[i]['Close']
            
            if prev_close <= 0:
                continue
            
            rvol = day_vol / avg_vol_30d if avg_vol_30d > 0 else 0
            change = abs((close - prev_close) / prev_close * 100)
            
            if (rvol >= CONFIG['MIN_RVOL'] and 
                change >= CONFIG['MIN_CHANGE_PCT'] and 
                close >= CONFIG['MIN_PRICE']):
                if rvol > best_rvol:
                    best_rvol = rvol
                    best_change = change
                    best_price = close
                    qualified_day = True
        
        if qualified_day:
            qualified.append({
                'symbol': sym,
                'rvol': best_rvol,
                'change': best_change,
                'price': best_price,
            })
    
    # Sort by RVOL descending, take top 8
    qualified.sort(key=lambda x: x['rvol'], reverse=True)
    result = qualified[:8]
    
    # If none qualified, use fallbacks
    if len(result) == 0:
        for fb in FALLBACK_STOCKS:
            if fb in all_data:
                daily = get_daily_bars(all_data[fb])
                prior = daily[daily.index.date < date.date()]
                if len(prior) > 0:
                    result.append({
                        'symbol': fb,
                        'rvol': 1.0,
                        'change': 0,
                        'price': prior.iloc[-1]['Close'],
                        'is_fallback': True,
                    })
    
    return result


def simulate_trade(orb, hourly_day_data, side, entry_price, stop_distance):
    """
    Simulate a single trade through the day's hourly bars.
    Returns P&L per share.
    """
    target_distance = stop_distance * CONFIG['TARGET_R_MULTIPLE']
    
    if side == 'long':
        stop_loss = entry_price - stop_distance
        take_profit = entry_price + target_distance
    else:
        stop_loss = entry_price + stop_distance
        take_profit = entry_price - target_distance
    
    # Walk through remaining hourly bars
    for _, bar in hourly_day_data.iterrows():
        if side == 'long':
            # Check stop loss first (conservative)
            if bar['Low'] <= stop_loss:
                return stop_loss - entry_price  # Loss
            # Check take profit
            if bar['High'] >= take_profit:
                return take_profit - entry_price  # Win
        else:  # short
            if bar['High'] >= stop_loss:
                return entry_price - stop_loss  # Loss (negative)
            if bar['Low'] <= take_profit:
                return entry_price - take_profit  # Win
    
    # EOD flatten — use last bar's close
    if len(hourly_day_data) > 0:
        last_close = hourly_day_data.iloc[-1]['Close']
        if side == 'long':
            return last_close - entry_price
        else:
            return entry_price - last_close
    
    return 0


def run_backtest():
    """Main backtest loop."""
    print("=" * 70)
    print("ORB STRATEGY BACKTEST — 12-Month Simulation")
    print(f"Starting Equity: ${CONFIG['STARTING_EQUITY']:,.2f}")
    print(f"Risk per trade: {CONFIG['TIER1_RISK']*100}% (#1) / {CONFIG['TIER2_RISK']*100}% (#2-4)")
    print(f"Target: {CONFIG['TARGET_R_MULTIPLE']}R | Max trades/day: {CONFIG['MAX_TRADES_PER_DAY']}")
    print("=" * 70)
    
    # Download data
    all_data = download_data(SCAN_STOCKS, period='1y')
    
    if 'SPY' not in all_data:
        print("ERROR: Could not download SPY data")
        return
    
    spy_hourly = all_data['SPY']
    spy_daily = get_daily_bars(spy_hourly)
    
    # Get VIX data
    vix_data = None
    if '^VIX' in all_data:
        vix_data = get_daily_bars(all_data['^VIX'])
    
    # Get trading days from SPY
    trading_days = sorted(set(spy_hourly.index.date))
    
    # Skip weekends already filtered by market data
    print(f"\nTrading days in period: {len(trading_days)}")
    
    # Track results
    equity = CONFIG['STARTING_EQUITY']
    equity_curve = [equity]
    daily_returns = []
    all_trades = []
    monthly_pnl = {}
    winning_days = 0
    losing_days = 0
    flat_days = 0
    no_trade_days = 0
    total_trading_days = 0
    
    for day_idx, date in enumerate(trading_days):
        date_dt = pd.Timestamp(date)
        day_str = date_dt.strftime('%Y-%m-%d')
        
        # Get SPY regime
        spy_sma200 = calculate_spy_sma(spy_daily, date_dt, 200)
        spy_sma50 = calculate_spy_sma(spy_daily, date_dt, 50)
        spy_price_row = spy_daily[spy_daily.index.date <= date]
        if len(spy_price_row) == 0:
            continue
        spy_price = spy_price_row.iloc[-1]['Close']
        
        is_bullish = spy_price > spy_sma200
        strong_uptrend = spy_price > spy_sma200 and spy_price > spy_sma50
        
        # Get VIX
        vix_level = 20
        if vix_data is not None:
            vix_row = vix_data[vix_data.index.date <= date]
            if len(vix_row) > 0:
                vix_level = vix_row.iloc[-1]['Close']
        
        # Determine regime
        longs_allowed = is_bullish and vix_level <= CONFIG['VIX_SHORTS_ONLY']
        aggressive_bull = is_bullish and vix_level <= CONFIG['VIX_AGGRESSIVE_BULL']
        
        # Select stocks for today
        stocks = select_stocks_for_day(all_data, date_dt)
        
        if len(stocks) == 0:
            no_trade_days += 1
            equity_curve.append(equity)
            daily_returns.append(0)
            continue
        
        total_trading_days += 1
        day_pnl = 0
        day_trades = 0
        day_trade_details = []
        
        # Check daily loss limit
        daily_loss_limit = equity * CONFIG['MAX_DAILY_LOSS_PCT']
        
        for rank, stock_info in enumerate(stocks[:5], 1):
            if day_trades >= CONFIG['MAX_TRADES_PER_DAY']:
                break
            
            if abs(day_pnl) >= daily_loss_limit:
                break
            
            sym = stock_info['symbol']
            if sym not in all_data:
                continue
            
            # Get ORB range
            orb = estimate_orb_range(all_data[sym], date_dt)
            if orb is None or orb['range'] <= 0:
                continue
            
            # Get the day's hourly data (after first bar)
            day_hourly = all_data[sym][all_data[sym].index.date == date]
            if len(day_hourly) < 2:
                continue
            
            # Determine signal from first hour's price action
            first_bar = day_hourly.iloc[0]
            
            # Check pre-market cool-off (use gap from previous close)
            daily = get_daily_bars(all_data[sym])
            prior = daily[daily.index.date < date]
            if len(prior) == 0:
                continue
            prev_close = prior.iloc[-1]['Close']
            gap_pct = abs((first_bar['Open'] - prev_close) / prev_close * 100) if prev_close > 0 else 0
            
            if gap_pct > CONFIG['PREMARKET_COOLOFF_PCT']:
                continue
            
            # Determine breakout direction from second bar
            if len(day_hourly) < 2:
                continue
            second_bar = day_hourly.iloc[1]
            
            signal = None
            entry_price = None
            
            # Long breakout: price goes above ORB high
            if second_bar['High'] > orb['high'] and longs_allowed:
                signal = 'long'
                entry_price = orb['high']  # Enter at breakout level
            # Short breakout: price goes below ORB low
            elif second_bar['Low'] < orb['low'] and not strong_uptrend:
                signal = 'short'
                entry_price = orb['low']
            
            if signal is None:
                continue
            
            # Calculate position size
            stop_distance = orb['range']
            
            # ATR fallback for tight ranges
            orb_range_pct = (orb['range'] / entry_price * 100) if entry_price > 0 else 0
            if orb_range_pct < 0.3:
                # Use 1.5% of price as proxy for 1.5x ATR
                stop_distance = entry_price * 0.015
            
            if rank == 1:
                risk_pct = CONFIG['TIER1_AGGRESSIVE_RISK'] if aggressive_bull else CONFIG['TIER1_RISK']
            else:
                risk_pct = CONFIG['TIER2_RISK']
            
            max_risk = equity * risk_pct
            risk_per_share = stop_distance
            
            if risk_per_share <= 0:
                continue
            
            shares = int(max_risk / risk_per_share)
            if shares <= 0:
                continue
            
            # Simulate trade through remaining bars
            remaining_bars = day_hourly.iloc[1:]  # After first bar
            pnl_per_share = simulate_trade(orb, remaining_bars, signal, entry_price, stop_distance)
            
            trade_pnl = pnl_per_share * shares
            day_pnl += trade_pnl
            day_trades += 1
            
            r_multiple = pnl_per_share / stop_distance if stop_distance > 0 else 0
            
            trade_record = {
                'date': day_str,
                'symbol': sym,
                'signal': signal,
                'entry': round(entry_price, 2),
                'shares': shares,
                'pnl': round(trade_pnl, 2),
                'r_multiple': round(r_multiple, 2),
                'risk_pct': risk_pct,
                'regime': 'aggressive_bull' if aggressive_bull else ('bull' if is_bullish else 'bear'),
                'vix': round(vix_level, 1),
            }
            all_trades.append(trade_record)
            day_trade_details.append(trade_record)
        
        # Update equity
        equity += day_pnl
        equity_curve.append(equity)
        daily_returns.append(day_pnl / (equity - day_pnl) * 100 if equity - day_pnl > 0 else 0)
        
        # Track monthly P&L
        month_key = date_dt.strftime('%Y-%m')
        if month_key not in monthly_pnl:
            monthly_pnl[month_key] = 0
        monthly_pnl[month_key] += day_pnl
        
        # Track win/loss days
        if day_trades == 0:
            no_trade_days += 1
        elif day_pnl > 0:
            winning_days += 1
        elif day_pnl < 0:
            losing_days += 1
        else:
            flat_days += 1
        
        # Progress
        if (day_idx + 1) % 50 == 0:
            print(f"  Day {day_idx+1}/{len(trading_days)} | Equity: ${equity:,.2f} | Trades: {len(all_trades)}")
    
    # ============================================================
    # RESULTS
    # ============================================================
    print("\n" + "=" * 70)
    print("BACKTEST RESULTS")
    print("=" * 70)
    
    total_return = (equity - CONFIG['STARTING_EQUITY']) / CONFIG['STARTING_EQUITY'] * 100
    
    # Trade statistics
    winning_trades = [t for t in all_trades if t['pnl'] > 0]
    losing_trades = [t for t in all_trades if t['pnl'] < 0]
    flat_trades = [t for t in all_trades if t['pnl'] == 0]
    
    win_rate = len(winning_trades) / len(all_trades) * 100 if all_trades else 0
    avg_win = np.mean([t['pnl'] for t in winning_trades]) if winning_trades else 0
    avg_loss = np.mean([t['pnl'] for t in losing_trades]) if losing_trades else 0
    
    # Risk-adjusted metrics
    daily_returns_arr = np.array(daily_returns)
    sharpe = np.mean(daily_returns_arr) / np.std(daily_returns_arr) * np.sqrt(252) if np.std(daily_returns_arr) > 0 else 0
    
    # Max drawdown
    peak = CONFIG['STARTING_EQUITY']
    max_dd = 0
    max_dd_pct = 0
    for eq in equity_curve:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100
        if dd > max_dd_pct:
            max_dd_pct = dd
            max_dd = peak - eq
    
    # Profit factor
    gross_profit = sum(t['pnl'] for t in winning_trades) if winning_trades else 0
    gross_loss = abs(sum(t['pnl'] for t in losing_trades)) if losing_trades else 1
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    
    # Average R-multiple
    avg_r = np.mean([t['r_multiple'] for t in all_trades]) if all_trades else 0
    
    # Best/worst trades
    best_trade = max(all_trades, key=lambda t: t['pnl']) if all_trades else None
    worst_trade = min(all_trades, key=lambda t: t['pnl']) if all_trades else None
    
    # Most traded symbols
    sym_counts = {}
    sym_pnl = {}
    for t in all_trades:
        sym = t['symbol']
        sym_counts[sym] = sym_counts.get(sym, 0) + 1
        sym_pnl[sym] = sym_pnl.get(sym, 0) + t['pnl']
    
    print(f"\n📊 ACCOUNT PERFORMANCE")
    print(f"  Starting Equity:    ${CONFIG['STARTING_EQUITY']:>12,.2f}")
    print(f"  Ending Equity:      ${equity:>12,.2f}")
    print(f"  Net P&L:            ${equity - CONFIG['STARTING_EQUITY']:>12,.2f}")
    print(f"  Total Return:       {total_return:>11.1f}%")
    print(f"  Sharpe Ratio:       {sharpe:>11.2f}")
    print(f"  Profit Factor:      {profit_factor:>11.2f}")
    print(f"  Max Drawdown:       ${max_dd:>12,.2f} ({max_dd_pct:.1f}%)")
    
    print(f"\n📈 TRADE STATISTICS")
    print(f"  Total Trades:       {len(all_trades):>8}")
    print(f"  Winning Trades:     {len(winning_trades):>8} ({win_rate:.1f}%)")
    print(f"  Losing Trades:      {len(losing_trades):>8} ({100-win_rate:.1f}%)")
    print(f"  Avg Win:            ${avg_win:>12,.2f}")
    print(f"  Avg Loss:           ${avg_loss:>12,.2f}")
    print(f"  Avg R-Multiple:     {avg_r:>11.2f}R")
    print(f"  Win/Loss Ratio:     {abs(avg_win/avg_loss) if avg_loss != 0 else 0:>11.2f}")
    
    print(f"\n📅 TRADING DAYS")
    print(f"  Total Calendar Days: {len(trading_days):>7}")
    print(f"  Days with Trades:   {winning_days + losing_days + flat_days:>8}")
    print(f"  No-Trade Days:      {no_trade_days:>8}")
    print(f"  Winning Days:       {winning_days:>8}")
    print(f"  Losing Days:        {losing_days:>8}")
    
    if best_trade:
        print(f"\n🏆 BEST TRADE:  {best_trade['symbol']} on {best_trade['date']} → ${best_trade['pnl']:,.2f} ({best_trade['r_multiple']}R)")
    if worst_trade:
        print(f"💀 WORST TRADE: {worst_trade['symbol']} on {worst_trade['date']} → ${worst_trade['pnl']:,.2f} ({worst_trade['r_multiple']}R)")
    
    print(f"\n📆 MONTHLY P&L")
    for month, pnl in sorted(monthly_pnl.items()):
        bar = "█" * max(1, int(abs(pnl) / 500))
        sign = "+" if pnl >= 0 else ""
        emoji = "🟢" if pnl >= 0 else "🔴"
        print(f"  {emoji} {month}: {sign}${pnl:>10,.2f}  {bar}")
    
    print(f"\n🔝 TOP SYMBOLS BY P&L")
    sorted_syms = sorted(sym_pnl.items(), key=lambda x: x[1], reverse=True)
    for sym, pnl in sorted_syms[:10]:
        trades = sym_counts[sym]
        emoji = "🟢" if pnl >= 0 else "🔴"
        print(f"  {emoji} {sym:>6}: ${pnl:>10,.2f} ({trades} trades)")
    
    print(f"\n🔻 BOTTOM SYMBOLS BY P&L")
    for sym, pnl in sorted_syms[-5:]:
        trades = sym_counts[sym]
        print(f"  🔴 {sym:>6}: ${pnl:>10,.2f} ({trades} trades)")
    
    # Regime breakdown
    regime_trades = {}
    for t in all_trades:
        r = t['regime']
        if r not in regime_trades:
            regime_trades[r] = {'count': 0, 'pnl': 0, 'wins': 0}
        regime_trades[r]['count'] += 1
        regime_trades[r]['pnl'] += t['pnl']
        if t['pnl'] > 0:
            regime_trades[r]['wins'] += 1
    
    print(f"\n🏛️ REGIME BREAKDOWN")
    for regime, data in sorted(regime_trades.items()):
        wr = data['wins'] / data['count'] * 100 if data['count'] > 0 else 0
        print(f"  {regime:>16}: {data['count']} trades, ${data['pnl']:>10,.2f} P&L, {wr:.0f}% win rate")
    
    print("\n" + "=" * 70)
    print("⚠️  IMPORTANT CAVEATS:")
    print("  • Uses hourly bars as proxy for 5-min ORB (actual results will vary)")
    print("  • No slippage/commissions modeled (Alpaca is commission-free)")
    print("  • Historical stock selection may differ from live scanner")
    print("  • Past performance does not guarantee future results")
    print("=" * 70)
    
    # Save results to JSON
    results = {
        'starting_equity': CONFIG['STARTING_EQUITY'],
        'ending_equity': round(equity, 2),
        'total_return_pct': round(total_return, 2),
        'net_pnl': round(equity - CONFIG['STARTING_EQUITY'], 2),
        'sharpe_ratio': round(sharpe, 2),
        'profit_factor': round(profit_factor, 2),
        'max_drawdown_pct': round(max_dd_pct, 2),
        'max_drawdown_dollar': round(max_dd, 2),
        'total_trades': len(all_trades),
        'win_rate_pct': round(win_rate, 1),
        'avg_win': round(avg_win, 2),
        'avg_loss': round(avg_loss, 2),
        'avg_r_multiple': round(avg_r, 2),
        'monthly_pnl': {k: round(v, 2) for k, v in monthly_pnl.items()},
        'top_symbols': {sym: round(pnl, 2) for sym, pnl in sorted_syms[:10]},
        'trades': all_trades[-20:],  # Last 20 trades for reference
    }
    
    with open('backtest_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to backtest_results.json")
    
    return results


if __name__ == '__main__':
    results = run_backtest()
