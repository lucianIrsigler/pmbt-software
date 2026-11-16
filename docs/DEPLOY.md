# Deployment guide

A start-to-finish checklist for putting the app on a server, in order. Each step says what
to do and what can go wrong. For the reasons behind it and day-to-day operations
(logs, backups, restores, rollbacks), see [RUNBOOK.md](RUNBOOK.md).

Placeholders: `<SERVER_IP>` is the server's IP address and `<your-domain>` the site's domain,
e.g. `daisyhealing.co.za`. Commands marked **(server)** run on the server over SSH; **(your
computer)** run in a terminal on your own machine, in the project folder.

---

## What you need first

- A **server**: Ubuntu 24.04, 1–2 GB RAM, with its public IP address.
- A **domain**.
- A **Google account** to send email from (Gmail or Workspace).
- On **your computer**: Docker Desktop (running), Git Bash, and an SSH key that can log in to the
  server as `deploy`. Deploys are built here and uploaded over SSH: no GitHub Actions or
  registry needed.

## 1. Point the domain at the server

At the domain registrar, add an **A record**: name `@` (the bare domain) or a subdomain such as
`bookings`, value `<SERVER_IP>`.

Add a second **A record**, name `www`, value `<SERVER_IP>` (the site redirects `www.` to the main
address).

> **Gotcha:** delete every other A or AAAA record for `@` and `www`. Registrars often create one
> pointing at their own hosting; with two, some devices (often phones) get the registrar's
> "web server is functioning correctly" page instead of the site.

Check: `nslookup <your-domain>` shows **only** `<SERVER_IP>`. It can take minutes to hours.

## 2. Set up the server (server, as root)

Follow [RUNBOOK.md §3](RUNBOOK.md#3-first-time-server-setup): updates, the `deploy` user,
key-only SSH, the firewall and Docker. Then create the app folder:

```sh
install -d -o deploy -g deploy /opt/daisyhealing
install -d -o deploy -g deploy /opt/daisyhealing/backups
install -d -m 700 -o deploy -g deploy /opt/daisyhealing/secrets
ls -la /opt/daisyhealing        # everything owned by deploy deploy
```

> **Gotcha:** it's `/opt/daisyhealing`, with a leading `/` (a top-level folder). Without it
> (`opt/daisyhealing` or `~/opt/…`) the folder lands in the home directory and the deploy
> fails with `scp: remote mkdir … Permission denied`.

## 3. The server's settings (`.env`)

Copy the template up (your computer):

```sh
scp deploy/.env.example deploy@<SERVER_IP>:/opt/daisyhealing/.env
```

Then edit it (server, as `deploy`):

```sh
cd /opt/daisyhealing
nano .env                 # save: Ctrl+O, Enter. Exit: Ctrl+X
chmod 600 .env
```

| Setting | Value |
|---|---|
| `DOMAIN` | `<your-domain>`: no `https://`, no `/` |
| `APP_URL` | `https://<your-domain>`: with `https://`, no `/` at the end |
| `IMAGE_PREFIX` | `daisyhealing` (a name for the images; lower case) |
| `IMAGE_TAG` | `latest` (each deploy updates it) |
| `POSTGRES_PASSWORD` | output of `openssl rand -hex 24` (run on the server) |
| `IP_HASH_SECRET` | output of `openssl rand -base64 48` (run on the server) |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `465` |
| `SMTP_USER` / `MAIL_FROM` | the Google address (the same in both) |
| `SMTP_PASS` | a Google **app password**: 16 characters, no spaces ([RUNBOOK.md §5](RUNBOOK.md#email-a-google-account-with-an-app-password)) |
| `BUSINESS_TZ` / `REMINDER_TIME` | `Africa/Johannesburg` / `17:00` |
| `BACKUP_SCHEDULE` | `0 2 * * *` (02:00 nightly) |
| `BACKUP_REMOTE` | empty until the off-server copy is set up (step 9) |
| `ALERT_EMAIL` | your email address, for backup-failure alerts |

> The passwords and secrets live **only** in this file. Never commit it or paste it anywhere.

## 4. Deploy settings (your computer)

Check your SSH key reaches the server: `ssh deploy@<SERVER_IP> "echo it works"`.

Then, in the project folder:

```sh
cp deploy/.env.deploy.example deploy/.env.deploy
```

and set `DEPLOY_HOST=deploy@<SERVER_IP>` in it (`DEPLOY_PATH=/opt/daisyhealing` and
`DEPLOY_PLATFORM=linux/amd64` are already right for a normal VPS). This file is not committed.

## 5. Deploy (your computer)

Start Docker Desktop, commit your changes, then in **Git Bash** in the project folder:

```sh
deploy/deploy.sh
```

It checks the code (typecheck, lint, unit tests), builds the images, uploads them to the server
(a few hundred MB, so it can take a while on a slow connection), starts the new version and
finally checks `https://<your-domain>/api/health`. It ends with `Deployed sha-…`.

The first deploy also downloads Postgres and Caddy on the server and gets the HTTPS certificate,
so give it a few minutes.

## 6. (Not needed) GitHub Actions

Deploying from GitHub instead is still possible (`.github/workflows/deploy.yml`, switched off
unless the `DEPLOY_ENABLED` variable is `true`; setup in [RUNBOOK.md §6](RUNBOOK.md#6-deploying)).
It costs GitHub Actions minutes and registry storage, which the script above avoids.

## 7. First run on the server

```sh
ssh deploy@<SERVER_IP>
cd /opt/daisyhealing
echo "alias dc='docker compose -f docker-compose.prod.yml'" >> ~/.bashrc && source ~/.bashrc
dc ps                                            # all Up; web "healthy"; migrate "Exited (0)"
dc run --rm migrate node tools/seed.mjs          # settings, hours, SAMPLE services/products
dc run --rm migrate node tools/create-user.mjs   # you: role admin
dc run --rm migrate node tools/create-user.mjs   # the owner: role owner
```

Roles: **`admin`** sees the owner's app and `/admin`; **`owner`** sees only her app (`/app`).

## 8. Set up the business and test

1. `https://<your-domain>/admin`: replace the sample **Services** and **Products** (untick what
   she doesn't offer), set the real **Hours**, fill in **Settings** (name, phone, email, address).
2. Book something on the public site **with your own email**: the confirmation should arrive
   (check spam). Open its link and cancel: the cancellation email should arrive too.
3. The owner signs in at `https://<your-domain>/app` on her phone and installs it
   (Settings → How to install the app).

## 9. Before telling clients

```sh
dc exec backup backup.sh                                  # a backup now
dc exec backup ls /backups/daily
dc exec backup restore.sh /backups/daily/<file>.dump      # restore drill into a scratch copy
dc exec db dropdb -U daisyhealing restore_check           # tidy up after the drill
dc exec backup alert.sh test                              # a test alert to ALERT_EMAIL
```

Then set up the **off-server backup copy** to a second machine:
[RUNBOOK.md §9](RUNBOOK.md#copying-backups-off-the-server-strongly-advised).

---

## From now on

- **Deploying a change:** commit, then `deploy/deploy.sh` (Docker Desktop running). Nothing to
  do on the server.
- **Logs:** `dc logs -f web` (or `jobs`, `backup`, `caddy`).
- **Everything else** (rollback, restore, new logins, changing passwords):
  [RUNBOOK.md](RUNBOOK.md).

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `Docker isn't running on this computer` | Start Docker Desktop and wait until it says it's running. |
| `there are uncommitted changes` | Commit first (so the deployed version has a name), or add `--allow-dirty` for a quick test. |
| `can't read …/.env` | The line above it says why. `No such file or directory`: `DEPLOY_PATH` isn't the app folder. Find it on the server with `docker inspect dogstuff-web-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'` (an earlier deploy may have used `/home/deploy/opt/daisyhealing`), or create `.env` (step 3). `Permission denied (publickey)`: SSH access. |
| `scp: … Permission denied` | The folder doesn't exist at that exact path (e.g. made in `~/opt/…`), or belongs to root. Fix it as in step 2. |
| `Permission denied (publickey)` | Your public key isn't in the server's `/home/deploy/.ssh/authorized_keys`. |
| `exec format error` in `dc logs` | The server's CPU type doesn't match `DEPLOY_PLATFORM` (ARM servers need `linux/arm64`). |
| Health check at the end fails | DNS doesn't point at the server yet, or `APP_URL` is wrong. On the server: `dc ps`, `dc logs web migrate caddy`. |
| Some devices show "web server is functioning correctly" | A second A/AAAA record (the registrar's) for `@` or `www`: delete it (step 1). |
| No HTTPS / certificate errors | DNS not pointing at the server yet, or ports 80/443 blocked (`ufw status`, the host's firewall). `dc logs caddy`. |
| `password authentication failed` / `database does not exist` | The database names in `deploy/docker-compose.prod.yml` must all match (`daisyhealing`). They can only change before the first deploy. |
| Emails don't arrive | `dc logs web jobs \| grep email`. "EAUTH" means `SMTP_USER` or the app password is wrong. Check spam. |
