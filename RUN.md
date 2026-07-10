docker compose up -d -> code changed
docker compose up -d --force-recreate -> env changed (4GB RAM is too low)
Zmiana w .env?
docker compose up -d --no-deps --force-recreate api
docker compose up -d --no-deps --force-recreate web
docker compose up -d --no-deps --force-recreate worker