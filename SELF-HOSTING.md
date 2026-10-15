# Self-hosting SurefyOS

This guide installs SurefyOS Community on one server with Docker Compose, and covers upgrades, backups, restores, connecting a model server that runs on your own hardware, and setting up the integrations of agents: Google Drive, Notion, Slack, WhatsApp, the website widget, web search and budgets.

The stack runs these services: **caddy** (HTTPS and routing), **workspace** (the web app), **api**, **worker**, **ml** (document parsing), **postgres** (with pgvector) and **redis**, and optionally **searxng** (web search). Everything is configured by one file, `infra/docker/.env`.

## Requirements

- A Linux server with Docker Engine and the Docker Compose plugin (`docker compose version` works), and `openssl`.
- Memory and disk for your documents and database. The `ml` service (document parsing) needs the most memory and its image carries the document models; watch `docker stats` and size the server for your document volume.
- A host name (for example `surefy.example.com`) whose DNS record points to the server. By default SurefyOS serves HTTPS itself: ports **80** and **443** must be free and reachable from the internet, and Caddy gets and renews the certificate on its own. If those ports are taken, or a proxy of yours does the HTTPS, see [Ports, plain HTTP and your own proxy](#ports-plain-http-and-your-own-proxy).

The host name must resolve from inside the server too: the API gives the `ml` service signed file addresses that use it.

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

| Option             | Effect                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `--domain host`    | The host name people open; SurefyOS serves HTTPS for it. Asked for when omitted.                    |
| `--http`           | With `--domain`: plain HTTP, no certificate.                                                        |
| `--public-url url` | Your own proxy does the HTTPS and forwards to SurefyOS; `url` is the address people open.           |
| `--http-port n`    | Host port for HTTP (default 80; 8080 with `--public-url`).                                          |
| `--https-port n`   | Host port for HTTPS (default 443).                                                                  |
| `--bind address`   | Host address the ports are published on (default every interface; `127.0.0.1` with `--public-url`). |
| `--searxng`        | Also run SearXNG, a web search service of your own. See [Web search](#web-search).                  |
| `--build`          | Build the images from this checkout instead of pulling them.                                        |
| `--no-start`       | Write `.env` and stop, so you can edit it before the first start.                                   |

`SUREFY_IMAGE_REGISTRY` and `SUREFY_VERSION` (in `.env`) choose where the images come from and which release runs. Running the installer again keeps the existing `.env` and repeats the pull, migrate and start steps.

### Ports, plain HTTP and your own proxy

| You have                                     | Install with                                  | People open                  |
| -------------------------------------------- | --------------------------------------------- | ---------------------------- |
| A public host name and free ports 80 and 443 | `--domain surefy.example.com`                 | `https://surefy.example.com` |
| A private network or a trial, no certificate | `--domain surefy.lan --http --http-port 8080` | `http://surefy.lan:8080`     |
| A proxy of your own that does the HTTPS      | `--public-url https://surefy.example.com`     | the address you gave         |

- **Plain HTTP** sends passwords and sessions unencrypted: use it on a private network only. Only the HTTP port is published, so a program that holds port 443 does not matter.
- **Your own proxy** forwards to `http://127.0.0.1:8080` (the installer prints the address). It must pass the original `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` headers, must not buffer responses (chat answers stream), and must accept request bodies as large as the files you upload. SurefyOS keeps the forwarded headers of proxies on private networks only. For a proxy on another machine, publish on an address it can reach with `--bind` and close the port to everyone else with a firewall.
- **The `ml` service downloads uploaded files from the public address**, so the server must be able to open that address from inside Docker. Behind your own proxy that means the proxy's public name must resolve and answer from the server itself.
- **Other ports.** Certificates from a public authority are issued over ports 80 and 443 only: with another `--https-port`, forward 80 and 443 to it or use a private name. The redirect from HTTP to HTTPS does not keep a custom HTTPS port, so open the HTTPS address, with its port, directly.

The choice is stored in `infra/docker/.env`: `COMPOSE_PROFILES` (`tls` or `http`), `SUREFY_SITE_ADDRESS`, `SUREFY_PUBLIC_HOST`, `SUREFY_HTTP_PORT`, `SUREFY_HTTPS_PORT`, `SUREFY_BIND_ADDRESS`, and with `--public-url` also `SUREFY_INTERNAL_ALIAS` and `SUREFY_TRUSTED_PROXIES`, next to `APP_ORIGIN` and `API_PUBLIC_URL`. To see the values of a mode, run `install.sh --no-start` for it in a copy of the repository and compare the files.

### First visit

Open the address the installer printed (`https://surefy.example.com`). The guided setup checks the server, then asks for your organization's details and the **setup token** the installer printed (it is also `SETUP_TOKEN` in `.env`). It creates your organization and its owner account. The token only protects the first start of a server that is open to the internet; setup cannot run again once it is complete.

A Community install holds one organization.

### Optional settings

Add these to `infra/docker/.env`, then run `docker compose -f infra/docker/compose.selfhost.yml up -d`.

| Setting         | Variables                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email (SMTP)    | `MAIL_DRIVER=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`                                                                          |
| S3 file storage | `STORAGE_DRIVER=s3`, `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_FORCE_PATH_STYLE`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` |
| Social sign-in  | `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET`; the same for `MICROSOFT` and `GITHUB`                                                                                |

The integrations of agents and Chat have their own settings, described in [Connect apps and channels](#connect-apps-and-channels), [Web search](#web-search) and [Budgets and alerts](#budgets-and-alerts).

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

## Connect apps and channels

People connect Google Drive, Notion, Slack and WhatsApp, and the MCP servers and APIs their agents call, in **Settings › Connections**. For Google Drive, Notion and Slack, SurefyOS needs an **OAuth app** that you register once at the provider; its client ID and secret go into `infra/docker/.env`. WhatsApp and MCP servers need no OAuth app.

An app that is not set up shows "Not set up on this install" in Settings › Connections. Each pair of client ID and secret is set together or not at all, otherwise the API refuses to start.

**Before you start**

- Providers send people back to your install, and Slack and Meta send events to it, so the install needs a public address with a valid certificate. Slack and Meta require `https://` addresses, and Google accepts `http://` only for `localhost`. A trial on plain HTTP cannot complete these steps.
- The **redirect address** you register at every OAuth app is your install's address followed by `/settings/connections/callback`, for example `https://surefy.example.com/settings/connections/callback`. It is `APP_ORIGIN` in `.env`, followed by that path.
- After editing `.env`, apply it: `surefy up -d`.

### Google Drive and Notion (knowledge sources)

| Setting                                        | Value                                         |
| ---------------------------------------------- | --------------------------------------------- |
| `CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_ID`     | the client ID of the Google OAuth client      |
| `CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET` | its client secret                             |
| `CONNECTIONS_OAUTH_NOTION_CLIENT_ID`           | the OAuth client ID of the Notion integration |
| `CONNECTIONS_OAUTH_NOTION_CLIENT_SECRET`       | its OAuth client secret                       |

**Google Drive**

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project and enable the **Google Drive API**.
2. Under **Google Auth Platform** (OAuth consent screen), set up the app. With a Google Workspace, choose the **Internal** audience so only your organization can sign in. Otherwise choose **External** and add the people who will connect as test users. Google lets a refresh token of an External app in testing mode live for 7 days, after which people reconnect; publishing the app removes that limit but needs Google's verification for the scope below.
3. Add the scope `https://www.googleapis.com/auth/drive.readonly` (read-only access to files; SurefyOS never writes to Drive).
4. Create an **OAuth client ID** of type **Web application** and add the redirect address above as an **authorized redirect URI**.
5. Put the client ID and secret into `.env`.

**Notion**

1. In Notion, open your integrations page (notion.so/profile/integrations) and create an integration of type **Public**.
2. Allow it to read content, and add the redirect address above as a **redirect URI**.
3. Put the OAuth client ID and OAuth client secret into `.env`.

When someone connects Notion, Notion asks which pages to share with the integration; only those pages can be synced.

Then, in **Knowledge**, add a source: choose Google Drive or Notion, pick the connection and the folder or pages. The source shows its sync state, and **Reconnect** appears when the sign-in expires.

### Slack

An agent answers in Slack when mentioned, and in direct messages if you allow it. One Slack workspace answers for one agent.

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) (from scratch, in your workspace).
2. **OAuth & Permissions**: add the redirect address above under **Redirect URLs**, and add these **bot token scopes**: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`.
3. **Basic Information**: copy the **Client ID**, **Client Secret** and **Signing Secret**.
4. Put them into `.env`, then run `surefy up -d`:

   ```text
   CONNECTIONS_OAUTH_SLACK_CLIENT_ID=...
   CONNECTIONS_OAUTH_SLACK_CLIENT_SECRET=...
   CONNECTIONS_SLACK_SIGNING_SECRET=...
   ```

   The signing secret checks that events come from Slack: without it, the events of Slack channels are refused.

5. In Settings › Connections, add **Slack** (this signs in to your workspace and installs the app there).
6. In the agent's **Publish** tab, choose **Set up Slack**, pick the connection and choose where the agent answers (listed channel IDs, or every channel the app is in; mentions only, or direct messages too). The tab shows a **Request URL**, which is your install's address followed by `/api/v1/channels/slack/events`.
7. In the Slack app, open **Event Subscriptions**, turn events on, paste the Request URL (Slack checks it at once) and subscribe to the bot events `app_mention` and `message.im`. For direct messages also turn on **Messages Tab › Allow users to send messages** under **App Home**.
8. Invite the app to the channels where it should answer (`/invite @name`).

A new external channel waits for an admin when a Builder publishes it; the agent does not answer in Slack until an admin approves it in the approvals queue.

### WhatsApp

WhatsApp runs on Meta's WhatsApp Business Platform. There is no OAuth app to register in `.env`: the credentials belong to your Meta app and are stored, encrypted, in a connection.

1. In [Meta for Developers](https://developers.facebook.com/), create a **Business** app and add the **WhatsApp** product; note the **phone number ID** and the **WhatsApp Business account ID** (WhatsApp Manager). Create a permanent access token through a system user, and copy the **App secret** (App settings › Basic).
2. In Settings › Connections, add **WhatsApp** with the access token, phone number ID and app secret. The connection is checked against Meta before it is saved.
3. In the agent's **Publish** tab, choose **Set up WhatsApp**, pick the connection, enter the business account ID and an optional welcome message. The tab shows a **Callback URL** (your install's address followed by `/api/v1/channels/whatsapp/webhook`) and a **Verify token**.
4. In the Meta app, open **WhatsApp › Configuration**, paste both, verify, and subscribe to **messages**.

Meta sends events to the Callback URL, so it must be reachable from the internet with a valid certificate. SurefyOS checks the signature of every event with the app secret.

### Website widget

The widget is a script tag that you paste into your website; the **Publish** tab of the agent shows it. In the tab, list the website addresses that may embed it (**allowed origins**). Nothing is set in `.env`, but the widget loads its script from `/widget/` and talks to `/api/` on your install's address: the bundled Caddy routes both to the API. Behind your own proxy, forward the whole host to SurefyOS as described in [Ports, plain HTTP and your own proxy](#ports-plain-http-and-your-own-proxy). A website served over HTTPS can embed the widget only from an HTTPS install.

### MCP servers and your own APIs

Agents use MCP servers and APIs through connections too: **Add connection › MCP** or **API**. They are called only over `https://` and never on private addresses. To use a server on your own network or in the Compose project, list its host name in `.env`:

```text
CONNECTIONS_LOCAL_HOSTS=mcp-tools,gpu-box.lan
```

Host names, separated by commas. Only listed hosts may be reached over plain `http://` and on private addresses, so list the ones you trust and nothing else. As with local model servers, `localhost` means the api container itself: use the service name or the machine's name.

## Web search

Chat and agents can search the web. An admin sets one search provider per organization in **Settings › Vault › Providers & keys › Search providers**:

| Provider    | Needs                             | Notes                                                                                                                               |
| ----------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Brave**   | An API key from Brave Search      | Queries go to Brave                                                                                                                 |
| **Tavily**  | An API key from Tavily            | Queries go to Tavily                                                                                                                |
| **SearXNG** | The address of a SearXNG instance | No account. Run the one in this stack, or your own instance. Queries go to the public search engines SearXNG asks, from your server |

The personal-data filter runs on every query first: masked text is what the provider receives, and a data type set to block ends the search before anything leaves the server.

### Run SearXNG with SurefyOS

SearXNG is an optional service of the stack. It publishes no port: only the other services can reach it, at `http://searxng:8080`. It is off unless its Compose profile is on.

- **New install:** add `--searxng` to the installer command.
- **Existing install:** add two lines to `infra/docker/.env` and start the service:

  ```bash
  echo "SEARXNG_SECRET=$(openssl rand -hex 32)" >> infra/docker/.env
  # add ,searxng to COMPOSE_PROFILES, for example COMPOSE_PROFILES=tls,searxng
  surefy up -d --wait
  ```

  Without a `SEARXNG_SECRET` the service stops at start with "server.secret_key is not changed".

Then tell SurefyOS where it is, in one of two ways:

- **Settings › Install › Web search**: enter `http://searxng:8080`. This serves every organization on the install that has no search provider of its own.
- **Vault › Search providers › Add › SearXNG**: enter the same address. **Save** runs a connection test first.

The Compose file in `infra/docker/searxng/settings.yml` turns on the JSON output SurefyOS asks for; without it SearXNG answers 403 and the test says "the instance does not allow the JSON format". For your own instance, enable `json` under `search.formats` in its `settings.yml`.

The API asks SearXNG with an ordinary request, so `CONNECTIONS_LOCAL_HOSTS` is not needed for it. The image is pinned to a dated release in `compose.selfhost.yml`; to update it, change the tag and run `surefy pull` and `surefy up -d`. It keeps no data worth backing up.

## Budgets and alerts

Cost budgets are set in the workspace, in **Settings › Usage & budgets**, by admins: nothing goes into `.env`. A budget covers a month (UTC) for the organization, a team or one person, and says what happens when it is reached: **notify only**, **switch to a local model**, or **pause cloud models**. Alerts go out at 50%, 80% and 100% by default.

What the operator provides:

- **Prices.** A budget counts the cost of calls, and a cost needs a price. Catalog models carry their list prices; a model without a known price is metered as 0, so it never reaches a budget (Insights flags it). Set a price in the Vault for a model you added by hand if it should count.
- **A local model for "switch to local".** Add one under [Connect a local model server](#connect-a-local-model-server) and enable it; without one, a reached budget refuses the call instead.
- **Redis.** The live spend counters are in Redis. A restart loses nothing: the hourly rollup rebuilds them from the database.
- **Email (SMTP)** if alerts should arrive by email; see [Optional settings](#optional-settings).

Enforcement is soft: calls already running when a budget is reached can overshoot it slightly.

## Voice input and the microphone

Chat's voice input uses the browser's own speech recognition, which browsers offer only on HTTPS pages (and `localhost`). On a plain-HTTP install (other than `localhost`) the browser refuses the microphone, so voice input does not work. Some browsers send the audio to their own speech service; the first use says so.

## Rotate the encryption key

Provider keys in Vault are encrypted with a data key per organization, wrapped by `ENCRYPTION_KEY`. The operator commands run in the worker container:

```bash
surefy exec worker node dist/cli.js keys status                  # data key versions and master keys in use
surefy exec worker node dist/cli.js keys rotate --all            # new data key per organization
surefy exec worker node dist/cli.js keys rewrap                  # after changing ENCRYPTION_KEY
```

To replace `ENCRYPTION_KEY`: put the old value in `ENCRYPTION_KEY_PREVIOUS`, set a new `ENCRYPTION_KEY` (`openssl rand -base64 32`), restart the api and worker, run `keys rewrap`, then remove `ENCRYPTION_KEY_PREVIOUS`. Take a backup first.

## Troubleshooting

| Symptom                                                                   | Check                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The stack does not start: `address already in use`                        | Another program uses a published port. Install with other ports, or in a mode that needs none of 80 and 443 (see [Ports, plain HTTP and your own proxy](#ports-plain-http-and-your-own-proxy)).                                                                         |
| The site does not load, or the certificate fails                          | DNS points to this server; ports 80 and 443 are open; `surefy logs caddy`.                                                                                                                                                                                              |
| The installer stops at "waiting"                                          | `surefy ps` shows the unhealthy service; `surefy logs <service>`. The first `ml` start takes up to two minutes.                                                                                                                                                         |
| `api` exits at start                                                      | `surefy logs api` prints the invalid or missing setting from `.env`.                                                                                                                                                                                                    |
| A document stays "processing"                                             | `surefy logs worker ml`. The `ml` service must reach `https://<your host name>`; check DNS and that Caddy is running.                                                                                                                                                   |
| "Not set up on this install" for an app                                   | Its `CONNECTIONS_OAUTH_<APP>_CLIENT_ID` and `_CLIENT_SECRET` are not both in `.env`, or `surefy up -d` was not run after adding them.                                                                                                                                   |
| The provider says "redirect_uri mismatch"                                 | The redirect address registered at the app must equal `APP_ORIGIN` followed by `/settings/connections/callback`, character for character.                                                                                                                               |
| Slack does not accept the Request URL, or an agent never answers in Slack | The install must be reachable by Slack over HTTPS; `CONNECTIONS_SLACK_SIGNING_SECRET` must match the app's signing secret (`surefy logs api` shows `AGENT_CHANNEL_SIGNATURE_INVALID`); the channel must be approved and active; the app must be invited to the channel. |
| Meta cannot verify the WhatsApp Callback URL                              | Paste the Verify token shown on the Publish tab; the URL must be reachable with a valid certificate.                                                                                                                                                                    |
| Web search is off in Chat                                                 | No search provider is set: see [Web search](#web-search). A SearXNG test that says "does not allow the JSON format" needs `json` in its `search.formats`.                                                                                                               |
| `searxng` exits at start                                                  | `surefy logs searxng`: a missing `SEARXNG_SECRET` in `.env` is the usual cause.                                                                                                                                                                                         |
| A local model test fails                                                  | The address is probably `localhost`; see [the address must work from inside the api container](#the-address-must-work-from-inside-the-api-container).                                                                                                                   |

Report security problems privately, as described in [SECURITY.md](./SECURITY.md).
