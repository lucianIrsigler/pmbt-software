# Runbook

How to set up, run, update and recover the production system. Commands assume an Ubuntu
24.04 server and that you are in the app folder on it (`/opt/dogstuff`) unless stated.

Short form used below: `dc` means `docker compose -f docker-compose.prod.yml`. Add it to
the deploy user's shell once: `echo "alias dc='docker compose -f docker-compose.prod.yml'" >> ~/.bashrc`.

---

## 1. What runs where

One server runs everything with Docker Compose (`deploy/docker-compose.prod.yml`):

| Container | What it does |
|---|---|
| `caddy` | HTTPS for the domain (certificates are automatic), forwards to `web`. The only container reachable from the internet (ports 80 and 443). |
| `web` | The app. Health: `/api/health/live` (app running) and `/api/health` (app + database). |
| `migrate` | Applies database migrations, then exits. Runs before `web` on every start. |
| `jobs` | Sends the day-before reminder emails daily at `REMINDER_TIME` (17:00). |
| `db` | Postgres 16. Data in the `dogstuff_db-data` volume. Not reachable from outside. |
| `backup` | Nightly backup into `./backups`, optional copy to a second machine. |

On the server, `/opt/dogstuff` holds: `docker-compose.prod.yml`, `Caddyfile` (both copied
by every deploy), `.env` (your settings), `backups/` and `secrets/`.

## 2. What you need

- **A server**: Ubuntu 24.04 VPS, 1–2 GB RAM, with a public IP address.
- **A domain** (or subdomain) for the site, e.g. `bookings.example.co.za`.
- **A Google account** to send email from (Gmail or Google Workspace).
- **Optional but strongly advised: a second machine** reachable over SSH for off-server backup
  copies (another small VPS, a home server…).
- **The GitHub repository**, with permission to add secrets.

## 3. First-time server setup

As root (or with `sudo`) on the new server:

```sh
# Updates, and automatic security updates from now on.
apt update && apt -y upgrade
apt -y install unattended-upgrades ufw
dpkg-reconfigure -f noninteractive unattended-upgrades

# A user for deploys. Log in with SSH keys only.
adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# Paste YOUR public key (from your own computer: cat ~/.ssh/id_ed25519.pub):
nano /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

# Turn off password logins (check you can log in as deploy with your key FIRST).
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh

# Firewall: SSH, HTTP and HTTPS only.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

Install Docker from Docker's own repository (follow
<https://docs.docker.com/engine/install/ubuntu/>), then:

```sh
usermod -aG docker deploy           # deploy can run docker (note: that's root-equivalent)
install -d -o deploy -g deploy /opt/dogstuff
install -d -o deploy -g deploy /opt/dogstuff/backups
install -d -m 700 -o deploy -g deploy /opt/dogstuff/secrets
```

Docker publishes ports past `ufw`; only `caddy` publishes any (80, 443), so that's fine. Never
add a `ports:` entry to `db` or `web`.

## 4. Domain

At your DNS provider, add an **A record** for the domain pointing at the server's IP address
(and an **AAAA** record if the server has IPv6). Wait until `ping <domain>` shows the server's
address. Caddy can only get a certificate once this works and ports 80/443 are open.

Want `www.` too? Add a DNS record for it, then add this to `deploy/Caddyfile`:

```
www.{$DOMAIN} {
	redir https://{$DOMAIN}{uri} permanent
}
```

## 5. Settings (`.env`)

```sh
cd /opt/dogstuff
# Copy deploy/.env.example from the repository to .env here, then:
nano .env
chmod 600 .env
```

Fill in every value. Generate the secrets on the server:

```sh
openssl rand -hex 24      # POSTGRES_PASSWORD (letters and digits only: it goes into a URL)
openssl rand -base64 48   # IP_HASH_SECRET
```

`IMAGE_PREFIX` is `ghcr.io/<github owner>/<repository>`, all lower case. `IMAGE_TAG` is set by
each deploy.

### Email: a Google account with an app password

1. Sign in to the Google account the emails should come from.
2. Turn on **2-Step Verification** (Google Account → Security).
3. Create an **App password** (Google Account → Security → App passwords; search "App
   passwords" if it's not shown). Name it "Bookings". Google shows 16 characters once.
   With Google Workspace, an admin may first need to allow app passwords.
4. In `.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=` the address,
   `SMTP_PASS=` the 16 characters (no spaces), `MAIL_FROM=` the same address.

Gmail allows about 500 recipients a day (Workspace about 2,000), far more than needed.

## 6. Automatic deploys (GitHub)

Every push to `main` that passes CI builds the images, pushes them to ghcr.io and updates the
server (`.github/workflows/deploy.yml`). To switch it on:

1. **A key for GitHub to reach the server.** On your own computer:
   ```sh
   ssh-keygen -t ed25519 -N "" -C "github-deploy" -f github_deploy
   ```
   Append `github_deploy.pub` to `/home/deploy/.ssh/authorized_keys` on the server.
2. **The server's fingerprint**, so GitHub only talks to your server:
   ```sh
   ssh-keyscan -t ed25519 <server ip or name>
   ```
3. In GitHub → repository → Settings → Secrets and variables → Actions:
   - **Secrets**: `DEPLOY_HOST` (server IP or name), `DEPLOY_USER` (`deploy`),
     `DEPLOY_SSH_KEY` (the whole private key file `github_deploy`),
     `DEPLOY_KNOWN_HOSTS` (the `ssh-keyscan` output line).
   - **Variables**: `APP_URL` (e.g. `https://bookings.example.co.za`),
     `DEPLOY_PATH` (`/opt/dogstuff`, the default), and last `DEPLOY_ENABLED` = `true`.
4. Delete the private key `github_deploy` from your computer; GitHub has it.

The images are private on ghcr.io; each deploy logs the server in with a short-lived token.

## 7. First deploy

1. GitHub → Actions → **Deploy** → **Run workflow** (or push to `main`). Watch it finish green;
   its last step checks `https://<domain>/api/health`.
2. On the server, load the starting data and create the owner's login:
   ```sh
   dc run --rm migrate pnpm db:seed        # settings, opening hours, SAMPLE services/products
   dc run --rm migrate pnpm user:create    # asks for email, name, role and password
   ```
3. Sign in at `https://<domain>/admin` and replace the sample services, products and prices,
   check the opening hours, and fill in **Settings** (business name, phone, email, address).
4. Have the owner sign in at `https://<domain>/app` on her phone and install it
   (Settings → "How to install the app").
5. Make a test booking with your own email address, check the confirmation email arrives,
   then cancel it.

## 8. Everyday operations

| Task | Command (in `/opt/dogstuff`) |
|---|---|
| Deploy a change | Push to `main` (or Actions → Deploy → Run workflow) |
| Status | `dc ps` (`web` should say `healthy`) |
| Logs | `dc logs -f web` (or `jobs`, `backup`, `caddy`, `db`); add `--since 1h` |
| Restart the app | `dc restart web` |
| Health | `curl https://<domain>/api/health` → `{"status":"ok","database":"ok"}` |
| Reminders by hand | `dc run --rm migrate pnpm reminders:send` (never sends twice) |
| A database shell | `dc exec db psql -U dogstuff dogstuff` |

Logs never contain names, phone numbers or emails (POPIA): only ids and error codes.

### Rolling back

Each deploy is tagged with its commit, e.g. `sha-1a2b3c4d5e6f` (see the Deploy run, or
`docker images`). To go back:

```sh
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=sha-1a2b3c4d5e6f/' .env
dc up -d --wait
```

Database migrations are **not** undone. Rolling back is safe when the deploys in between
changed no migrations (check `drizzle/` in those commits). If they did, the older app may not
work with the newer database (for example, migration 0007 made `price_cents` required, so an
older version couldn't save bookings). Then prefer fixing forward with a new deploy, or, as a
last resort, restore the backup from before the deploy (section 10), losing changes made since.

## 9. Backups

- **When**: nightly at 02:00 business time (`BACKUP_SCHEDULE` in `.env`, cron syntax).
- **Where**: `/opt/dogstuff/backups/daily` (newest 14 kept) and `backups/weekly`
  (Sundays, newest 8 kept). Files are compressed Postgres dumps, e.g.
  `dogstuff-2026-11-03T0200.dump`.
- **Check**: `dc logs backup --since 48h` shows each run; `ls -lh backups/daily`.
- **Back up now** (e.g. before something risky): `dc exec backup backup.sh`.

### Copying backups off the server (strongly advised)

A backup on the same server is lost if the server is. On the **second machine**:

```sh
adduser --disabled-password --gecos "" backup
install -d -m 700 -o backup -g backup /home/backup/.ssh /home/backup/dogstuff-backups
```

On the **app server**:

```sh
cd /opt/dogstuff
ssh-keygen -t ed25519 -N "" -C "dogstuff-backup" -f secrets/backup_ssh_key
ssh-keyscan -t ed25519 <second machine> > secrets/known_hosts
cat secrets/backup_ssh_key.pub      # add this line to /home/backup/.ssh/authorized_keys there
```

Then in `.env`: `BACKUP_REMOTE=backup@<second machine>:dogstuff-backups/`, run
`dc up -d backup` and test with `dc exec backup backup.sh` (it should end with "copied to …").

The copy never deletes anything on the second machine, so a problem on the app server can't
wipe it. Delete old files there now and then (e.g. keep a year).

## 10. Restoring a backup

**Tested** on 2026-11-03 with this exact setup (production images and compose file, run
locally): backup, restore into a scratch database with matching row counts, a full restore
over the live database with the app stopped, and the app healthy afterwards. Repeat the
drill on the real server after the first deploy, and every few months.

### Drill: restore into a scratch database (safe any time)

```sh
dc exec backup ls /backups/daily
dc exec backup restore.sh /backups/daily/dogstuff-2026-11-03T0200.dump
```

It prints row counts (clients, appointments, …) from the copy, named `restore_check`;
compare them with the live data. Remove it afterwards:
`dc exec db dropdb -U dogstuff restore_check`.

### For real: replace the live database

Only when the live data is lost or damaged. Bookings made after the backup are lost.

```sh
dc exec backup backup.sh                     # keep a copy of the current state anyway
dc stop web jobs                             # nothing may write meanwhile
dc exec -e RESTORE_INTO_LIVE=yes backup restore.sh /backups/daily/<file>.dump dogstuff
dc up -d --wait                              # migrations bring an older backup up to date
curl https://<domain>/api/health
```

From the off-server copy: copy the file back into `/opt/dogstuff/backups/daily/` first
(e.g. `scp backup@<second machine>:dogstuff-backups/daily/<file>.dump backups/daily/`).

### A whole new server

Set up sections 3–6, copy the newest backup into `backups/daily/`, run one deploy (it
creates an empty database), then follow "For real" above.

## 11. Logins

- **New login, or forgotten password**: `dc run --rm migrate pnpm user:create`. With an
  existing email it can change the role and reset the password.
- **Roles**: `owner` opens her app only; `admin` opens the app and `/admin` (stats, prices,
  hours, settings). Give the owner's own login `owner`. What each role may open is decided in
  `src/lib/permissions.ts` (Casbin). A role change applies on the next page load.
- **Sign everyone out** (e.g. a lost phone): `dc exec db psql -U dogstuff dogstuff -c "delete from session;"`.

## 12. Changing secrets

| Secret | How |
|---|---|
| Google app password | Create a new app password, put it in `SMTP_PASS`, `dc up -d`, then revoke the old one in Google. |
| `IP_HASH_SECRET` | Only scrambles IP addresses for the rate limits; changing it just resets those counts (it does **not** sign anyone out). New value in `.env`, `dc up -d`. |
| `POSTGRES_PASSWORD` | `dc exec db psql -U dogstuff dogstuff -c "alter user dogstuff password '<new>';"`, put the same value in `.env`, `dc up -d`. |
| GitHub deploy key | Make a new key (section 6), add it to `authorized_keys`, update `DEPLOY_SSH_KEY`, then remove the old line from `authorized_keys`. |
| Backup key | New key in `secrets/` (section 9), update the second machine's `authorized_keys`, remove the old line. |

## 13. Troubleshooting

- **No HTTPS / certificate errors**: `dc logs caddy`. Usually DNS doesn't point at the server
  yet, or ports 80/443 are blocked (`ufw status`, the hosting provider's firewall).
- **Deploy fails at "Check the live site"**: `dc ps` and `dc logs web migrate`. A failed
  migration stops `web` from starting; fix and redeploy, or roll back (section 8).
- **Emails don't arrive**: `dc logs web jobs | grep email`. "EAUTH" means the SMTP user or app
  password is wrong. Check the client's spam folder.
- **Reminders**: `dc logs jobs` shows the next run time and how many were sent.
- **Disk space**: `df -h`; `docker system df`; `docker image prune -f` removes old images.
