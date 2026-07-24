#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/protect-broker/current"
DATA_DIR="/var/lib/protect-broker"
CONFIG_DIR="/etc/protect-broker"
ENV_FILE="${CONFIG_DIR}/protect-broker.env"
SERVICE_NAME="protect-broker"
SERVICE_USER="protect-broker"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DB_NAME="protect_broker"
DB_USER="protect_broker"
DB_PASSWORD=""
EXTERNAL_DB_URL=""
HOSTNAME_VALUE="0.0.0.0"
PORT_VALUE="3000"
SKIP_SYSTEM_UPGRADE="false"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
	cat <<'EOF'
Usage: sudo ./scripts/install-debian.sh [options]

Options:
	--external-db-url URL   Use an existing PostgreSQL database instead of installing a local one.
	--hostname HOST         Bind the API to a specific host. Default: 0.0.0.0
	--port PORT             Bind the API to a specific port. Default: 3000
	--skip-system-upgrade   Skip apt update/upgrade.
	--help                  Show this help.
EOF
}

log() {
	printf '[protect-broker] %s\n' "$1"
}

require_root() {
	if [[ "${EUID}" -ne 0 ]]; then
		echo "This installer must be run with sudo or as root." >&2
		exit 1
	fi
}

parse_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--external-db-url)
				EXTERNAL_DB_URL="${2:-}"
				shift 2
				;;
			--hostname)
				HOSTNAME_VALUE="${2:-}"
				shift 2
				;;
			--port)
				PORT_VALUE="${2:-}"
				shift 2
				;;
			--skip-system-upgrade)
				SKIP_SYSTEM_UPGRADE="true"
				shift
				;;
			--help)
				usage
				exit 0
				;;
			*)
				echo "Unknown argument: $1" >&2
				usage >&2
				exit 1
				;;
		esac
	done
}

validate_environment() {
	if [[ ! -f "${SOURCE_DIR}/package.json" ]]; then
		echo "Installer must be run from the Protect Broker repository." >&2
		exit 1
	fi

	if [[ ! -f /etc/debian_version ]]; then
		echo "This installer supports Debian-based systems only." >&2
		exit 1
	fi
}

apt_install() {
	DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

install_system_packages() {
	log "Installing operating system dependencies."

	if [[ "${SKIP_SYSTEM_UPGRADE}" != "true" ]]; then
		apt-get update
		DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
	else
		apt-get update
	fi

	apt_install ca-certificates curl gnupg lsb-release rsync postgresql postgresql-contrib

	if ! command -v node >/dev/null 2>&1; then
		log "Installing Node.js 22 LTS."
		mkdir -p /etc/apt/keyrings
		curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
		echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
			>/etc/apt/sources.list.d/nodesource.list
		apt-get update
		apt_install nodejs
	fi
}

ensure_service_user() {
	if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
		log "Creating service user ${SERVICE_USER}."
		useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin "${SERVICE_USER}"
	fi
}

prepare_directories() {
	log "Preparing application directories."
	mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${CONFIG_DIR}"
	chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DATA_DIR}"
	chmod 0750 "${DATA_DIR}"
	chmod 0755 /opt/protect-broker
}

sync_application_files() {
	log "Copying application files into ${INSTALL_DIR}."
	mkdir -p "${INSTALL_DIR}"
	rsync -a --delete \
		--exclude node_modules \
		--exclude dist \
		--exclude .git \
		--exclude .data \
		--exclude coverage \
		--exclude playwright-report \
		--exclude test-results \
		"${SOURCE_DIR}/" "${INSTALL_DIR}/"
	chown -R root:root "${INSTALL_DIR}"
}

generate_password() {
	openssl rand -base64 24 | tr -d '\n'
}

setup_local_postgres() {
	local role_exists

	if [[ -n "${EXTERNAL_DB_URL}" ]]; then
		return
	fi

	log "Provisioning local PostgreSQL database."
	systemctl enable postgresql >/dev/null 2>&1 || true
	systemctl restart postgresql

	DB_PASSWORD="$(generate_password)"
	role_exists="$(su - postgres -s /bin/sh -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | tr -d '[:space:]')"

	if [[ "${role_exists}" == "1" ]]; then
		log "PostgreSQL role ${DB_USER} exists; resetting password for installer-managed credentials."
		su - postgres -s /bin/sh -c "psql -c \"ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';\""
	else
		su - postgres -s /bin/sh -c "psql -c \"CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';\""
	fi

	su - postgres -s /bin/sh -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || \
		su - postgres -s /bin/sh -c "createdb --owner=${DB_USER} ${DB_NAME}"

	EXTERNAL_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
}

write_environment_file() {
	log "Writing systemd environment file."

	cat >"${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=${HOSTNAME_VALUE}
PORT=${PORT_VALUE}
DATABASE_URL=${EXTERNAL_DB_URL}
PB_APP_ROOT=${INSTALL_DIR}
PB_DATA_DIR=${DATA_DIR}
PB_WEB_DIST_DIR=${INSTALL_DIR}/apps/web/dist
EOF

	chmod 0600 "${ENV_FILE}"
	chown root:"${SERVICE_USER}" "${ENV_FILE}"
}

install_dependencies_and_build() {
	log "Installing Node.js dependencies and building Protect Broker."

	pushd "${INSTALL_DIR}" >/dev/null
	npm install
	npm run build
	popd >/dev/null
}

run_database_setup() {
	log "Generating Prisma client and applying database migrations."

	pushd "${INSTALL_DIR}" >/dev/null
	set -a
	# shellcheck disable=SC1090
	source "${ENV_FILE}"
	set +a
	npm run prisma:generate -w @protect-broker/database
	npm run db:migrate
	popd >/dev/null
}

install_systemd_service() {
	log "Installing systemd service."
	install -m 0644 "${INSTALL_DIR}/scripts/protect-broker.service" "${SERVICE_FILE}"
	systemctl daemon-reload
	systemctl enable "${SERVICE_NAME}"
}

start_service() {
	log "Starting Protect Broker service."
	systemctl restart "${SERVICE_NAME}"
}

get_primary_ip() {
	hostname -I 2>/dev/null | awk '{print $1}'
}

print_success() {
	local server_ip
	server_ip="$(get_primary_ip)"

	echo
	echo "Protect Broker Installed"
	echo
	echo "Open your browser"
	echo
	echo "http://${server_ip:-SERVER-IP}:${PORT_VALUE}"
}

main() {
	require_root
	parse_args "$@"
	validate_environment
	install_system_packages
	ensure_service_user
	prepare_directories
	sync_application_files
	setup_local_postgres
	write_environment_file
	install_dependencies_and_build
	run_database_setup
	install_systemd_service
	start_service
	print_success
}

main "$@"
