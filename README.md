# 4-H Pancake Breakfast Tracker (Electron)

Local Windows desktop app for tracking arrivals and sales in grouped batches.

## Features
- Large color-coded primary `+1` buttons for:
  - Adult Ticket
  - Adult @ Door
  - Child Ticket
  - Child @ Door
- Matching `-1` correction buttons under each category.
- Configurable inactivity batch commit delay (default 5 seconds) with bright green edge-band countdown.
- Config tab for ticket prices, saved in `config.json`.
- CSV event log in `data/visits.csv` (easy to analyze in Excel/Pandas).
- Stats tab with:
  - Visitors over time (batch and cumulative)
  - Sales over time (batch and cumulative)

## Prerequisites
- Node.js LTS (includes npm)

## Install
```powershell
npm install
```

## Run
```powershell
npm start
```

## Data files
- `config.json` - ticket pricing.
- `data/visits.csv` - one row per committed group batch with timestamp, counts, prices, visitors, and sales.
