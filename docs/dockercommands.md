# Docker commands for BekaChat

## Run PostgreSQL
sudo docker run -d \
  --name bekadb_postgres \
  -p 5432:5432 \
  -v bekadb_data:/var/lib/postgresql \
  -e POSTGRES_USER=alecs \
  -e POSTGRES_PASSWORD=alecs \
  -e POSTGRES_DB=bekadb \
  postgres:latest
