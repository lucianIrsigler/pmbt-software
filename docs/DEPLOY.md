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
- The code **pushed to GitHub** (`git push`). Deploys build from GitHub, not your computer.

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
| `IMAGE_PREFIX` | `ghcr.io/lucianirsigler/pmbt-software` (all lower case) |
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

> The passwords and secrets live **only** in this file. Never commit it, paste it anywhere, or
> put the Postgres password in GitHub: GitHub doesn't need it.

## 4. A deploy key for GitHub (your computer)

```sh
ssh-keygen -t ed25519 -N "" -C "github-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub | ssh deploy@<SERVER_IP> "cat >> ~/.ssh/authorized_keys"
ssh -i ~/.ssh/github_deploy deploy@<SERVER_IP> "echo it works"     # test
cat ~/.ssh/github_deploy                                            # copy for the next step
ssh-keyscan -t ed25519 <SERVER_IP>                                  # copy this line too
```

After step 5, delete the private key: `rm ~/.ssh/github_deploy` (GitHub has it).

## 5. GitHub secrets and variables

GitHub → the repository → **Settings → Secrets and variables → Actions**. Use the **Repository**
ones, and put each on the right tab: one on the wrong tab counts as empty.

**Secrets** tab:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `<SERVER_IP>` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the whole private key, `-----BEGIN …` to `… END OPENSSH PRIVATE KEY-----` |
| `DEPLOY_KNOWN_HOSTS` | the one `ssh-keyscan` line: `<SERVER_IP> ssh-ed25519 AAAA…` |

**Variables** tab:

| Name | Value |
|---|---|
| `APP_URL` | `https://<your-domain>` (same as in `.env`) |
| `DEPLOY_PATH` | `/opt/daisyhealing`: exactly the server folder |
| `DEPLOY_ENABLED` | `true`. Set this **last**. |

## 6. Deploy

Push to `main` (deploys run after CI passes), or GitHub → **Actions → Deploy → Run workflow**.
Wait for it to go green. Its last step checks `https://<your-domain>/api/health`.

If a run fails, fix the cause, then open the run and click **Re-run failed jobs** (no new push
needed). Common failures are in [Troubleshooting](#troubleshooting) below.

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

- **Deploying a change:** `git push` to `main`. CI runs, then Deploy. Nothing to do on the
  server.
- **Logs:** `dc logs -f web` (or `jobs`, `backup`, `caddy`).
- **Everything else** (rollback, restore, new logins, changing passwords):
  [RUNBOOK.md](RUNBOOK.md).

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| Deploy does nothing | `DEPLOY_ENABLED` isn't `true`, or it's on the Secrets tab instead of Variables. |
| `scp: remote mkdir "/opt/…": Permission denied` | The folder doesn't exist at that exact path (e.g. made in `~/opt/…`), or belongs to root. Fix it as in step 2; check `DEPLOY_PATH` matches. |
| `Permission denied (publickey)` | The deploy key's `.pub` isn't in the server's `~/.ssh/authorized_keys`, or `DEPLOY_SSH_KEY` is incomplete (must include the BEGIN/END lines). |
| `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` is wrong: re-run `ssh-keyscan -t ed25519 <SERVER_IP>` and paste that one line. |
| "Check the live site" fails | DNS doesn't point at the server yet, or `APP_URL` is wrong. On the server: `dc ps`, `dc logs web migrate caddy`. |
| Some devices show "web server is functioning correctly" | A second A/AAAA record (the registrar's) for `@` or `www`: delete it (step 1). |
| No HTTPS / certificate errors | DNS not pointing at the server yet, or ports 80/443 blocked (`ufw status`, the host's firewall). `dc logs caddy`. |
| `password authentication failed` / `database does not exist` | The database names in `deploy/docker-compose.prod.yml` must all match (`daisyhealing`). They can only change before the first deploy. |
| Emails don't arrive | `dc logs web jobs \| grep email`. "EAUTH" means `SMTP_USER` or the app password is wrong. Check spam. |
| `***` in GitHub logs | GitHub hiding secret values (e.g. `deploy`). Harmless. |
