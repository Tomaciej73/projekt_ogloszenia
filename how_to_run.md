# How to Run MultiPortal Listing Manager Locally

This guide is written for non-technical users. Follow each step in order.

## Before You Start

You need 4 programs installed on your computer:

| Program | Where to get it |
|---------|----------------|
| **Node.js** | Go to https://nodejs.org — click the big green "LTS" button, then install it |
| **Docker Desktop** | Go to https://www.docker.com/products/docker-desktop — download and install |
| **Git** | Go to https://git-scm.com — download and install |
| **PowerShell** | Already on your Windows computer — press `Windows + X`, choose "Terminal" or "PowerShell" |

After installing Node.js, open PowerShell and type this to install pnpm:

```powershell
npm install -g pnpm
```

## Step-by-Step

### 1. Open PowerShell

Press the `Windows` key on your keyboard, type `PowerShell`, and open it.

### 2. Get the project

```powershell
git clone <project-url>
cd multiportal-listing-manager
```

Replace `<project-url>` with the actual Git URL of the project.

### 3. Create your configuration file

```powershell
copy .env.example .env
```

This creates a file called `.env` with default settings. You don't need to change anything — it works out of the box for local testing.

### 4. Start the database and services

Make sure Docker Desktop is running (you should see the Docker icon in your taskbar). Then:

```powershell
docker compose up -d
```

Wait about 10-15 seconds. This starts PostgreSQL, Redis, and MinIO in the background.

To check if everything is running:

```powershell
docker compose ps
```

You should see 3 services all showing "healthy".

### 5. Install project dependencies

```powershell
pnpm install
```

This downloads all the libraries the project needs. Takes 1-2 minutes the first time.

### 6. Set up the database

```powershell
npx prisma migrate dev --name init
```

This creates all the database tables. Only needed once.

### 7. Start the application

Open **3 separate PowerShell windows**, all in the project folder. In each one, run one of these:

**Window 1 — Backend API:**
```powershell
pnpm --filter @multiportal/api dev
```

**Window 2 — Background Worker:**
```powershell
pnpm --filter @multiportal/worker dev
```

**Window 3 — Website:**
```powershell
pnpm --filter @multiportal/web dev
```

### 8. Open in your browser

- **Website:** http://localhost:3000
- **API:** http://localhost:3001
- **MinIO (file storage):** http://localhost:9001 — login: `minioadmin` / `minioadmin`

## Stopping the Application

- Press `Ctrl + C` in each PowerShell window to stop the apps
- To stop the database services: `docker compose down`
- To stop and delete all data: `docker compose down -v`

## Troubleshooting

**"pnpm is not recognized":** Run `npm install -g pnpm` in PowerShell, then close and reopen PowerShell.

**Docker errors:** Make sure Docker Desktop is running. Check the taskbar — there should be a Docker icon.

**Port already in use:** Another program is using port 3000, 3001, 5432, 6379, 9000, or 9001. Close that program or change the ports in the `.env` file.

**Can't connect to database:** Wait 15 seconds after `docker compose up -d` for services to fully start, then try again.

**Nothing shows in the browser:** Make sure all 3 PowerShell windows from step 7 are still running and didn't show any errors.