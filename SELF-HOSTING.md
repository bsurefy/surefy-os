# Self-hosting SurefyOS

This guide installs SurefyOS Community on one server with Docker Compose, and covers upgrades, backups, restores and connecting a model server that runs on your own hardware.

The stack runs these services: **caddy** (HTTPS and routing), **workspace** (the web app), **api**, **worker**, **ml** (document parsing), **postgres** (with pgvector) and **redis**. Everything is configured by one file, `infra/docker/.env`.

## Requirements

- A Linux server with Docker Engine and the Docker Compose plugin (`docker compose version` works), and `openssl`.
- Memory and disk for your documents and database. The `ml` service (document parsing) needs the most memory and its image carries the document models; watch `docker stats` and size the server for your document volume.
- A host name (for example `surefy.example.com`) whose DNS record points to the server, with ports **80** and **443** reachable from the internet. Caddy gets and renews the HTTPS certificate on its own.

The host name must be a real, publicly resolvable name: the API gives the `ml` service signed file addresses that use it.

## Install

```bash
git clone https://github.com/bsurefy/surefy-os.git
cd surefy-os
infra/scripts/install.sh --domain surefy.example.com
```

The installer:

1. generates the secrets (`AUTH_SECRET`, `ENCRYPTION_KEY`, `SETUP_TOKEN`, `ML_SERVICE_TOKEN`) and the database passwords,
2. writes `infra/docker/.env`, readable by its owner only,
3. pulls the images, starts Postgres and Redis, and runs the database migrations,
4. starts the stack and waits until every service is healthy.

It prints the address and the **setup token** when it is done. Options:

| Option          | Effect                                                            |
| --------------- | ----------------------------------------------------------------- |
| `--domain host` | The host name people open. Asked for when omitted.                |
| `--build`       | Build the images from this checkout instead of pulling them.      |
| `--no-start`    | Write `.env` and stop, so you can edit it before the first start. |

`SUREFY_IMAGE_REGISTRY` and `SUREFY_VERSION` (in `.env`) choose where the images come from and which release runs. Running the installer again keeps the existing `.env` and repeats the pull, migrate and start steps.

### First visit

Open `https://surefy.example.com`. The guided setup checks the server, then asks for your organization's details and the **setup token** the installer printed (it is also `SETUP_TOKEN` in `.env`). It creates your organization and its owner account. The token only protects the first start of a server that is open to the internet; setup cannot run again once it is complete.

A Community install holds one organization.

### Optional settings

Add these to `infra/docker/.env`, then run `docker compose -f infra/docker/compose.selfhost.yml up -d`.

| Setting         | Variables                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email (SMTP)    | `MAIL_DRIVER=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`                                                                          |
| S3 file storage | `STORAGE_DRIVER=s3`, `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_FORCE_PATH_STYLE`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` |
| Social sign-in  | `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET`; the same for `MICROSOFT` and `GITHUB`                                                                                |

Without SMTP, emails are written to the api log instead of being sent. Files are stored in the `files` Docker volume by default.

## Commands you will use

Run these from the repository folder.

```bash
alias surefy='docker compose -f infra/docker/compose.selfhost.yml --project-directory infra/docker'

surefy ps                    # service status
surefy logs -f api worker    # follow logs
surefy restart api worker    # restart services
surefy down                  # stop and remove the containers (volumes are kept)
```

## Upgrade

1. [Back up](#back-up) first.
2. Set the new release in `infra/docker/.env`: `SUREFY_VERSION=<release>`. When you build from a checkout, update it instead (`git pull`) and use `build` below.
3. Fetch the images and restart:

   ```bash
   surefy pull        # or: surefy build
   surefy up -d --wait
   ```

The `migrate` service runs the database migrations before the api and worker start, and does nothing when the database is current. If a migration fails, the api and worker stay stopped and `surefy logs migrate` shows why. Do not retry blindly: restore your backup if the database was left half-migrated.

To go back to an earlier release, restore the backup you took in step 1 together with that release's `SUREFY_VERSION`.

## Back up

```bash
infra/scripts/backup.sh /var/backups/surefy
```

It writes one folder, `surefy-backup-<UTC time>/`, with:

| File            | Holds                                            |
| --------------- | ------------------------------------------------ |
| `database.dump` | the Postgres database (custom format)            |
| `files.tar.gz`  | the files volume: uploads, avatars and exports   |
| `env`           | a copy of `infra/docker/.env`, with every secret |

The `env` file holds `ENCRYPTION_KEY`. **Without that key, the provider keys stored in Vault cannot be decrypted.** Keep backup folders private and off the server, and run the script from cron for regular backups:

```cron
0 3 * * * cd /opt/surefy-os && infra/scripts/backup.sh /var/backups/surefy
```

The script exits with an error and removes its partial folder if any step fails. It does not delete old backups: rotate them yourself. The Redis volume holds only queues and caches, and is not backed up.

If you use S3 storage, the files live in your bucket and are not in `files.tar.gz`; back the bucket up with your storage provider.

## Restore

Restore onto a server with the repository checked out and Docker installed. The steps work for the same server or a new one.

1. Put the backup's `env` file in place and stop anything running:

   ```bash
   cp /var/backups/surefy/surefy-backup-<time>/env infra/docker/.env
   chmod 600 infra/docker/.env
   surefy down
   ```

2. Start an empty database. On a new volume, Postgres creates the roles and the database from the passwords in `.env`. To restore over an existing install, remove its volumes first with `surefy down -v`: this **deletes the current data**.

   ```bash
   surefy up -d --wait postgres
   ```

3. Load the dump and the files:

   ```bash
   surefy exec -T postgres pg_restore -U postgres --dbname surefy --clean --if-exists --exit-on-error \
     < /var/backups/surefy/surefy-backup-<time>/database.dump

   surefy run --rm --no-deps -T -v /var/backups/surefy/surefy-backup-<time>:/backup:ro --user 0 \
     --entrypoint tar files-permissions -xzf /backup/files.tar.gz -C /data/storage
   ```

   If you changed `SUREFY_DATABASE` from its default `surefy`, use that name for `--dbname`.

4. Start the stack. Migrations run first, so a backup from an older release is brought up to date:

   ```bash
   surefy up -d --wait
   ```

Sign in and check that your chats, knowledge bases and Vault connections are there. The provider keys decrypt only when `ENCRYPTION_KEY` is the one from the backup.

## Connect a local model server

SurefyOS talks to any server that speaks the OpenAI API: Ollama, vLLM, llama.cpp (`llama-server`), LM Studio and others. You add the server in **Settings › Vault › Local models**:

1. Choose **Add local server** and enter the server's address and, if it needs one, a key. The address may omit `/v1`: `http://192.168.1.20:11434` works for Ollama.
2. Choose **Test connection**. The models the server reports are listed.
3. Enable the models you want, then pick one in a chat.

A model added this way has no catalog entry, so it runs without price, vision or tools.

### The address must work from inside the api container

The API runs in a container, so **`localhost` and `127.0.0.1` mean the api container itself, not your server.** Use an address the container can reach:

- **A server on another machine:** its name or IP address, for example `http://gpu-box.lan:8000`.
- **A server on the same host as Docker:** the host's own network address (for example `http://192.168.1.20:11434`). Make the server listen on all interfaces, not only on loopback (Ollama: `OLLAMA_HOST=0.0.0.0`; llama.cpp: `--host 0.0.0.0`), and allow the port in the host firewall for the Docker networks only.
- **A server in the same Compose project:** run it as another service, so its name is the address. Save this as `infra/docker/compose.local-models.yml`:

  ```yaml
  services:
    ollama:
      image: ollama/ollama:latest
      restart: unless-stopped
      volumes:
        - ollama-data:/root/.ollama
  volumes:
    ollama-data:
  ```

  Start it with both files, then use `http://ollama:11434` in Vault:

  ```bash
  docker compose -f infra/docker/compose.selfhost.yml -f infra/docker/compose.local-models.yml \
    --project-directory infra/docker up -d
  docker compose -f infra/docker/compose.selfhost.yml -f infra/docker/compose.local-models.yml \
    --project-directory infra/docker exec ollama ollama pull llama3.2
  ```

  Add the second `-f` to later `up` commands too, or the extra service is left running unmanaged. For GPU use, follow the model server's own Docker instructions.

Chats marked private stay on local models.

## Rotate the encryption key

Provider keys in Vault are encrypted with a data key per organization, wrapped by `ENCRYPTION_KEY`. The operator commands run in the worker container:

```bash
surefy exec worker node dist/cli.js keys status                  # data key versions and master keys in use
surefy exec worker node dist/cli.js keys rotate --all            # new data key per organization
surefy exec worker node dist/cli.js keys rewrap                  # after changing ENCRYPTION_KEY
```

To replace `ENCRYPTION_KEY`: put the old value in `ENCRYPTION_KEY_PREVIOUS`, set a new `ENCRYPTION_KEY` (`openssl rand -base64 32`), restart the api and worker, run `keys rewrap`, then remove `ENCRYPTION_KEY_PREVIOUS`. Take a backup first.

## Troubleshooting

| Symptom                                          | Check                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The site does not load, or the certificate fails | DNS points to this server; ports 80 and 443 are open; `surefy logs caddy`.                                                                            |
| The installer stops at "waiting"                 | `surefy ps` shows the unhealthy service; `surefy logs <service>`. The first `ml` start takes up to two minutes.                                       |
| `api` exits at start                             | `surefy logs api` prints the invalid or missing setting from `.env`.                                                                                  |
| A document stays "processing"                    | `surefy logs worker ml`. The `ml` service must reach `https://<your host name>`; check DNS and that Caddy is running.                                 |
| A local model test fails                         | The address is probably `localhost`; see [the address must work from inside the api container](#the-address-must-work-from-inside-the-api-container). |

Report security problems privately, as described in [SECURITY.md](./SECURITY.md).
