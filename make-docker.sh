docker build -f Containerfile -t huntress:local .
docker save huntress:local -o huntress-local.tar
