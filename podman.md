# Podman Commands for BekaChat

## Essential Commands

### freshstart, remove all and reinstall:

```bash
podman compose down --volumes && podman container prune -f && podman volume prune -f && podman compose up --build --force-recreate
```
### Start Containers (First Time or After Rebuild)
```bash
podman compose up --build
```
Starts all containers with fresh image builds. Use this after code changes or on first start. Frontend runs on port 5173, backend on port 3001.

### Start Containers (No Code Changes)
```bash
podman compose up
```
Starts existing containers without rebuilding images. **Only works if images already exist** - will fail if containers were removed.

### Start Containers in Background
```bash
podman compose up -d
```
Same as above but runs in the background. Add `--build` if you need to rebuild: `podman compose up -d --build`

### Stop Containers
```bash
podman compose down
```
Stops and removes all containers while preserving volumes (data persists).

### Stop Containers & Remove All Volumes
```bash
podman compose down --volumes
```
Stops containers and removes all associated volumes (data is lost).

### Restart Containers
```bash
podman compose restart
```
Restarts all running containers without rebuilding.

## Rebuild & Force Recreate

### Full Rebuild with Force Recreation
```bash
podman compose down --volumes && podman container prune -f && podman volume prune -f && podman compose up --build --force-recreate
```
Complete cleanup and fresh start - removes old containers, volumes, and builds everything from scratch.

### Rebuild Only (Keep Data)
```bash
podman compose up --build
```
Rebuilds images but preserves database volume.

### Force Recreate (No Rebuild)
```bash
podman compose up --force-recreate
```
Recreates containers without rebuilding images - useful if you only changed env vars.

## Viewing Logs & Status

### View Live Logs
```bash
podman compose logs -f
```
Follow logs from all containers in real-time.

### View App Logs Only
```bash
podman compose logs -f app
```
Follow only the BekaChat app container logs.

### View PostgreSQL Logs Only
```bash
podman compose logs -f postgres
```
Follow only the PostgreSQL container logs.

### View Listed Containers
```bash
podman container ls -a
```
List all containers (running and stopped).

### View Images
```bash
podman image ls
```
List all images on your system.

## Cleanup & Maintenance

### Remove Unused Containers
```bash
podman container prune -f
```
Force removes all stopped containers.

### Remove Unused Volumes
```bash
podman volume prune -f
```
Force removes all unused volumes.

### Remove Unused Images
```bash
podman image prune -f
```
Force removes all dangling images.

### Full System Cleanup
```bash
podman system prune -a --volumes -f
```
Nuclear option - removes all unused containers, images, volumes, and networks.

## Accessing Containers

### Execute Command in Running Container
```bash
podman compose exec app sh
```
Open shell in the app container.

### Execute Command in PostgreSQL Container
```bash
podman compose exec postgres psql -U admin -d bekadb
```
Open PostgreSQL interactive shell (change admin/bekadb if needed).

## Development Workflow

### Quick Decision Chart
| Scenario | Command |
|----------|---------|
| First time starting | `podman compose up --build` |
| Code changes made | `podman compose up --build` |
| Just stopping & restarting (no changes) | `podman compose up` |
| Just need to restart running containers | `podman compose restart` |
| Everything deleted/cleaned | `podman compose up --build` |
| Only dotenv/.env file changed | `podman compose up` (for configs) or `podman compose restart` (for code) |

### Full Reset (Recommended Before Major Changes)
```bash
podman compose down --volumes && podman container prune -f && podman volume prune -f && podman compose up --build --force-recreate
```

### Quick Restart (After Code Changes)
```bash
podman compose restart app
```
Containers have hot-reload enabled, so this usually isn't needed.

### Check Service Health
```bash
podman compose ps
```
Shows status of all services.

## Environment Variables

Default values in `docker-compose.yml`:
- `DB_USER`: admin
- `DB_PASSWORD`: admin123
- `DB_NAME`: bekadb
- `DB_HOST`: postgres
- `DB_PORT`: 5432
- `PORT`: 3001 (backend)
- `VITE_PORT`: 5173 (frontend)
- `JWT_SECRET`: supersecret123

Override by creating a `.env` file in the project root:
```bash
DB_USER=myuser
DB_PASSWORD=mypassword
JWT_SECRET=mysecret
```

## Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **PostgreSQL**: localhost:5432

Default admin credentials:
- Email: `admin@admin.ro`
- Password: `admin`
