# House Rules Mini Connect Site

A small answer-collection site for the final mini-connects round.

## Run

```sh
npm start
```

Player page:

```text
http://localhost:4317
```

Admin page:

```text
http://localhost:4317/admin.html?key=house
```

To change the admin key:

```sh
ADMIN_KEY=your-key npm start
```

To let teams join from phones on the same Wi-Fi, run:

```sh
HOST=0.0.0.0 npm start
```

Then open `http://YOUR-LAPTOP-IP:4317` on phones.

## Railway

Railway provides the `PORT` environment variable automatically. The app does not force a localhost-only bind, so Railway can route traffic to it.

Use these settings:

```text
Start command: npm start
Admin key: set ADMIN_KEY in Railway variables if you do not want the default key
```

## Submission Rules

- Teams enter a team name, then see the 8 mini-connect boxes.
- The admin page has one switch per mini-connect, so you can open them one at a time.
- Teams can submit multiple guesses for any open prompt.
- Every guess is timestamped separately.
- No auto-correction is applied.
- The admin page lets the host mark guesses correct or wrong.
- Admin scores are calculated from marked-correct submissions.
- For mini-connect prompts, points are assigned by timestamp order: first correct team gets 10, second gets 9, third gets 8, and so on.
- The admin page shows a score table for all mini-connect prompts, plus total for each team.

## Saved Data

Teams and submissions are saved to:

```text
data/submissions.json
```

This file is created automatically. It is intentionally ignored by git.

To save somewhere else:

```sh
DATA_FILE=/path/to/submissions.json npm start
```

On some hosts, local JSON storage may not survive redeploys or container replacement. It will survive normal server restarts as long as the same filesystem is kept.

## Workflow

1. Show the mini-connect images on your slide deck.
2. Teams submit guesses from their phones.
3. On the admin page, remove accidental/duplicate teams if needed.
4. Mark pending guesses correct or wrong.
5. Use `Export CSV` if you want to check or preserve all guesses outside the app.

Current answers and aliases live in `server.js`.
