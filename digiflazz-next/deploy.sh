#!/usr/bin/env bash
#
# deploy.sh — Installer otomatis Digiflazz Next (Ubuntu/Debian)
# Memasang: Node.js, MariaDB, Nginx, Certbot/SSL, PM2, build app, dan
# mengonfigurasi domain. Idempotent: paket yang sudah ada akan dilewati.
#
# Jalankan sebagai root:  sudo bash deploy.sh
#
set -euo pipefail

# ----------------------------- tampilan CLI ---------------------------------
C_RESET="\033[0m"; C_DIM="\033[2m"; C_RED="\033[31m"; C_GREEN="\033[32m"
C_YELLOW="\033[33m"; C_BLUE="\033[34m"; C_CYAN="\033[36m"; C_BOLD="\033[1m"

step()  { printf "\n${C_BOLD}${C_BLUE}==>${C_RESET} ${C_BOLD}%s${C_RESET}\n" "$1"; }
info()  { printf "    ${C_CYAN}i${C_RESET} %s\n" "$1"; }
ok()    { printf "    ${C_GREEN}OK${C_RESET} %s\n" "$1"; }
skip()  { printf "    ${C_DIM}--${C_RESET} %s ${C_DIM}(sudah ada, dilewati)${C_RESET}\n" "$1"; }
warn()  { printf "    ${C_YELLOW}!!${C_RESET} %s\n" "$1"; }
die()   { printf "\n${C_RED}${C_BOLD}GAGAL:${C_RESET} %s\n" "$1" >&2; exit 1; }

have()  { command -v "$1" >/dev/null 2>&1; }
# Jalankan perintah kritis: sembunyikan output saat sukses, tampilkan & hentikan
# (dengan log lengkap) saat gagal. Mencegah kegagalan "tertelan" oleh set -e
# pada pola `cmd && ok` yang membuat script lanjut seolah sukses.
run() {
  local _log; _log="$(mktemp)"
  if "$@" >"${_log}" 2>&1; then
rm -f "${_log}"; return 0
  fi
  printf "\n${C_RED}${C_BOLD}GAGAL menjalankan:${C_RESET} %s\n" "$*" >&2
  printf "${C_DIM}--- output ---${C_RESET}\n" >&2
  cat "${_log}" >&2
  rm -f "${_log}"
  return 1
}
# Hasilkan string acak alfanumerik sepanjang N (default 32).
# Catatan: hindari pola `tr ... | head` karena head menutup pipe lebih awal
# sehingga tr menerima SIGPIPE (exit 141) dan — dengan `set -o pipefail` +
# `set -e` — membuat script keluar diam-diam. Di sini input dibatasi lebih
# dulu lalu dipotong via parameter expansion (tanpa pipe yang bisa SIGPIPE).
rand() {
  local n="${1:-32}" s
  s="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c "$(( n * 20 ))" /dev/urandom))"
  printf '%s' "${s:0:n}"
}

banner() {
  printf "${C_BOLD}${C_CYAN}"
  cat <<'ART'
  ____  _       _  __ _                
 |  _ \(_) __ _(_)/ _| | __ _ ___________
 | | | | |/ _` | | |_| |/ _` |_  /_  /
 | |_| | | (_| | |  _| | (_| |/ / / /
 |____/|_|\__, |_|_| |_|\__,_/___/___|
          |___/   Auto Deploy Installer
ART
  printf "${C_RESET}\n"
}

# --------------------------- pemeriksaan awal -------------------------------
[ "$(id -u)" -eq 0 ] || die "Script harus dijalankan sebagai root (gunakan: sudo bash deploy.sh)."
have apt-get || die "Hanya mendukung distro berbasis Debian/Ubuntu (apt)."

banner

# --------------------------- input konfigurasi ------------------------------
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="digiflazz-next"
APP_PORT="3005"
NODE_MAJOR="20"

step "Konfigurasi deployment"
read -rp "    Domain (mis. panel.contoh.com): " DOMAIN
[ -n "${DOMAIN}" ] || die "Domain wajib diisi."
read -rp "    Email untuk SSL Let's Encrypt: " LE_EMAIL
[ -n "${LE_EMAIL}" ] || die "Email SSL wajib diisi."
read -rp "    Aktifkan HTTPS/SSL otomatis via Certbot? [Y/n]: " ENABLE_SSL
ENABLE_SSL="${ENABLE_SSL:-Y}"

# Kredensial database (auto-generate bila kosong)
DB_NAME="digiflazz_next"
DB_USER="digiflazz"
DB_PASS="$(rand 24)"
DB_HOST="127.0.0.1"
DB_PORT="3306"

# Secret aplikasi
AUTH_SECRET="$(rand 48)"
ENCRYPTION_KEY="$(rand 48)"

info "Domain      : ${DOMAIN}"
info "App dir     : ${APP_DIR}"
info "Port internal: ${APP_PORT}"

# ------------------------------- APT update ---------------------------------
step "Memperbarui indeks paket APT"
export DEBIAN_FRONTEND=noninteractive
run apt-get update -y || die "apt-get update gagal. Cek koneksi internet/repositori."
ok "apt-get update selesai"

install_pkg() {
  # install_pkg <command-to-check> <apt-package> [label]
  local cmd="$1" pkg="$2" label="${3:-$2}"
if [ -n "$cmd" ] && have "$cmd"; then
    skip "$label"
  else
 info "Memasang ${label}..."
    run apt-get install -y "$pkg" || die "Gagal memasang ${label}."
  ok "${label} terpasang"
  fi
}

step "Memasang utilitas dasar"
install_pkg curl curl
install_pkg git git
install_pkg gpg gnupg
have ufw && info "ufw tersedia" || install_pkg ufw ufw

# ------------------------------- Node.js ------------------------------------
step "Memasang Node.js ${NODE_MAJOR}.x"
NODE_OK=0
if have node; then
  CURRENT_NODE="$(node -v | sed 's/v//' | cut -d. -f1)"
  if [ "${CURRENT_NODE}" -ge "${NODE_MAJOR}" ] 2>/dev/null; then
    skip "Node.js v$(node -v | sed 's/v//')"
    NODE_OK=1
  else
    warn "Node.js terpasang tapi versi lama (v${CURRENT_NODE}). Memutakhirkan..."
  fi
fi
if [ "${NODE_OK}" -eq 0 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1 \
    || die "Gagal menambahkan repositori NodeSource."
  run apt-get install -y nodejs || die "Gagal memasang Node.js."
  ok "Node.js $(node -v) terpasang"
fi
have npm && info "npm $(npm -v)"

# ------------------------------- MariaDB ------------------------------------
step "Memasang MariaDB"
if have mariadbd || have mysqld || systemctl list-unit-files 2>/dev/null | grep -q mariadb; then
  skip "MariaDB server"
else
  run apt-get install -y mariadb-server mariadb-client || die "Gagal memasang MariaDB."
  ok "MariaDB terpasang"
fi
systemctl enable --now mariadb >/dev/null 2>&1 || systemctl enable --now mysql >/dev/null 2>&1 || true
ok "Layanan MariaDB aktif"

step "Menyiapkan database & pengguna"
# Idempotent: CREATE IF NOT EXISTS + set/refresh password user.
mysql --protocol=socket -u root <<SQL || die "Gagal menyiapkan database/pengguna MariaDB."
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'${DB_HOST}' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'${DB_HOST}' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'${DB_HOST}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
ok "Database '${DB_NAME}' & user '${DB_USER}' siap"

# ------------------------------ .env aplikasi -------------------------------
step "Menulis berkas .env"
ENV_FILE="${APP_DIR}/.env"
DATABASE_URL="mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
if [ -f "${ENV_FILE}" ]; then
  cp "${ENV_FILE}" "${ENV_FILE}.bak.$(date +%s)"
  warn ".env lama dicadangkan ke .env.bak.*"
fi
cat > "${ENV_FILE}" <<ENV
DATABASE_URL="${DATABASE_URL}"

AUTH_SECRET="${AUTH_SECRET}"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

DIGIFLAZZ_BASE_URL="https://member.digiflazz.com"
DIGIFLAZZ_API_PREFIX="/api/v1"

NODE_ENV="production"
PORT="${APP_PORT}"
ENV
ok ".env tertulis"

# --------------------------- dependensi & build -----------------------------
step "Memasang dependensi npm"
cd "${APP_DIR}"
if [ -f package-lock.json ]; then
  run npm ci || run npm install || die "Gagal memasang dependensi npm."
else
  run npm install || die "Gagal memasang dependensi npm."
fi
ok "Dependensi terpasang"

step "Migrasi skema database (prisma db push)"
run npx prisma generate || die "Gagal generate Prisma client."
ok "Prisma client digenerate"
run npx prisma db push || die "Gagal sinkronisasi skema database."
ok "Skema database tersinkron"

step "Seed data awal (super admin + tenant demo)"
SEED_OUT="$(npm run seed 2>&1 || true)"
if echo "${SEED_OUT}" | grep -qi "selesai"; then ok "Seed selesai"; else warn "Seed mungkin sudah pernah dijalankan"; fi

step "Build aplikasi (next build)"
run npm run build || die "Build produksi gagal. Cek error di atas."
ok "Build produksi selesai"

# --------------------------------- PM2 --------------------------------------
step "Memasang PM2 (process manager)"
if have pm2; then
  skip "PM2"
else
  run npm install -g pm2 || die "Gagal memasang PM2."
  ok "PM2 terpasang"
fi

step "Menjalankan aplikasi via PM2"
cd "${APP_DIR}"
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${APP_NAME}" --update-env >/dev/null 2>&1
  ok "Aplikasi '${APP_NAME}' di-restart"
else
  PORT="${APP_PORT}" pm2 start "npm" --name "${APP_NAME}" -- run start >/dev/null 2>&1
  ok "Aplikasi '${APP_NAME}' dijalankan di port ${APP_PORT}"
fi
pm2 save >/dev/null 2>&1
# Pasang startup systemd untuk PM2 (idempotent).
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
ok "PM2 dikonfigurasi auto-start saat boot"

# -------------------------------- Nginx -------------------------------------
step "Memasang Nginx"
install_pkg nginx nginx
systemctl enable --now nginx >/dev/null 2>&1 || true

step "Mengonfigurasi virtual host Nginx untuk ${DOMAIN}"
NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}.conf"
cat > "${NGINX_CONF}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Batas unggah cookie .txt
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Streaming NDJSON (fitur Jalankan) — jangan buffer.
        proxy_buffering off;
        proxy_read_timeout 330s;
    }
}
NGINX
ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
# Nonaktifkan default site bila masih ada agar tidak bentrok.
[ -e /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx && ok "Nginx dikonfigurasi & di-reload" || die "Konfigurasi Nginx tidak valid."

# ------------------------------- Firewall -----------------------------------
step "Mengatur firewall (ufw)"
if have ufw; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || { ufw allow 80/tcp >/dev/null 2>&1; ufw allow 443/tcp >/dev/null 2>&1; }
  ok "Port 22, 80, 443 diizinkan"
else
  warn "ufw tidak tersedia, lewati konfigurasi firewall"
fi

# -------------------------------- SSL ---------------------------------------
SSL_ACTIVE=0
case "${ENABLE_SSL}" in
  [Yy]*)
    step "Memasang SSL via Certbot (Let's Encrypt)"
    install_pkg certbot certbot
    if [ ! -d /etc/letsencrypt/live ] || ! certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
      install_pkg "" python3-certbot-nginx "plugin certbot-nginx" 2>/dev/null || apt-get install -y python3-certbot-nginx >/dev/null 2>&1 || true
      info "Meminta sertifikat untuk ${DOMAIN}..."
      if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LE_EMAIL}" --redirect >/dev/null 2>&1; then
        ok "Sertifikat SSL terpasang & HTTPS aktif"
        SSL_ACTIVE=1
      else
        warn "Certbot gagal (pastikan domain sudah mengarah ke IP server ini). HTTP tetap aktif."
      fi
    else
      skip "Sertifikat SSL untuk ${DOMAIN}"
      SSL_ACTIVE=1
    fi
    ;;
  *)
    warn "SSL dilewati atas permintaan. Situs berjalan via HTTP."
    ;;
esac

# ------------------------- verifikasi kesehatan -----------------------------
step "Verifikasi aplikasi"
sleep 3
if curl -fsS -o /dev/null "http://127.0.0.1:${APP_PORT}/login"; then
  ok "Aplikasi merespons di port ${APP_PORT}"
else
  warn "Aplikasi belum merespons. Cek log: pm2 logs ${APP_NAME}"
fi

# ----------------------- simpan & tampilkan kredensial ----------------------
PROTO="http"; [ "${SSL_ACTIVE}" -eq 1 ] && PROTO="https"
CRED_FILE="${APP_DIR}/DEPLOY_CREDENTIALS.txt"
cat > "${CRED_FILE}" <<CRED
========================================================
 DIGIFLAZZ NEXT — KREDENSIAL DEPLOYMENT
 Dibuat: $(date)
========================================================

URL Aplikasi   : ${PROTO}://${DOMAIN}

-- Database (MariaDB) ----------------------------------
  Host         : ${DB_HOST}
  Port         : ${DB_PORT}
  Database     : ${DB_NAME}
  Username     : ${DB_USER}
  Password     : ${DB_PASS}
  DATABASE_URL : ${DATABASE_URL}

-- Secret Aplikasi (.env) ------------------------------
  AUTH_SECRET     : ${AUTH_SECRET}
  ENCRYPTION_KEY  : ${ENCRYPTION_KEY}

-- Akun Login Default ----------------------------------
  Super Admin (kelola semua tenant):
    email    : super@digiflazz.local
    password : Super#12345

  Owner Demo Tenant (akun penyewa):
    email    : admin@digiflazz.local
    password : Admin#12345

  >> GANTI kata sandi ini setelah login pertama! <<

-- Perintah Berguna ------------------------------------
  Lihat log    : pm2 logs ${APP_NAME}
  Restart app  : pm2 restart ${APP_NAME}
  Status       : pm2 status
  Update app   : npm run deploy:update   (lihat README)
========================================================
CRED
chmod 600 "${CRED_FILE}"

printf "\n${C_GREEN}${C_BOLD}"
printf "============================================================\n"
printf " DEPLOYMENT SELESAI \xF0\x9F\x8E\x89\n"
printf "============================================================${C_RESET}\n\n"
printf "  ${C_BOLD}URL       :${C_RESET} ${C_CYAN}%s://%s${C_RESET}\n" "${PROTO}" "${DOMAIN}"
printf "  ${C_BOLD}DB Name   :${C_RESET} %s\n" "${DB_NAME}"
printf "  ${C_BOLD}DB User   :${C_RESET} %s\n" "${DB_USER}"
printf "  ${C_BOLD}DB Pass   :${C_RESET} %s\n" "${DB_PASS}"
printf "\n"
printf "  ${C_BOLD}Super Admin :${C_RESET} super@digiflazz.local / Super#12345\n"
printf "  ${C_BOLD}Owner Demo  :${C_RESET} admin@digiflazz.local / Admin#12345\n"
printf "\n"
printf "  ${C_YELLOW}Kredensial lengkap tersimpan di:${C_RESET} %s\n" "${CRED_FILE}"
printf "  ${C_YELLOW}Segera ganti semua kata sandi default!${C_RESET}\n\n"
