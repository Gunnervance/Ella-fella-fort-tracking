# Squad Tracker

A Fortnite post-match log and squad dashboard. Plain HTML/CSS/JS hosted on GitHub Pages, with a free Supabase database so the whole squad shares one set of stats.

## What's in here

| File | What it does |
|---|---|
| `index.html` | The page: Log match, Dashboard, History, Squad tabs |
| `styles.css` | All the styling |
| `app.js` | Saving games, loading stats, building the dashboard |
| `config.js` | Supabase URL and publishable key, game modes, and "how it ended" options |
| `schema.sql` | Creates the database tables. Run once in Supabase |

## One-time setup

1. **Create the tables.** In Supabase, open **SQL Editor → New query**, paste everything from `schema.sql`, and click **Run**.
2. **Turn on GitHub Pages.** Repo **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**.
3. Open the site, go to the **Squad** tab, and add everyone's gamertag.

## Using it

- After each game, open **Log match**, enter placement, drop spot, how it ended, and each player's kills/damage/assists from the end screen.
- **Dashboard** shows win rate, average placement, a placement trend, what ends your games, per-player averages, and which drop spots work.
- **Last session** groups games played without a 3-hour break.

## Changing options

Edit `config.js` to rename the squad, add modes, or change the "how it ended" list. Commit and push; Pages updates in a minute or two.

## Security note

Right now anyone with the site link can log or delete games. That's fine for a link you only share with your squad. To lock it down later, add Supabase Auth and change the policies in `schema.sql` to `to authenticated`.
