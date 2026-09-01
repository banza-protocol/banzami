# Banzami self-hosted CI runner — Linux + Docker-in-Docker.
#
# Why Linux and why a container: three CI jobs use `services: postgres`, and
# GitHub requires a LINUX self-hosted runner with Docker for service containers
# ("If your workflows use ... service containers, then you must use a Linux
# runner ... and Docker must be installed"). A macOS runner cannot run them, so
# the runner lives in a Linux container on Docker Desktop's VM.
#
# Why docker-IN-docker rather than mounting the host socket: with a mounted
# socket the service container is a sibling on the host daemon, and its published
# port lands on the daemon host — not inside this container. The job would then
# look for postgres on its own localhost:5433 and find nothing. Running our own
# dockerd means service containers publish onto THIS container's localhost, which
# is what the workflows expect.
#
# The privilege this needs is confined to the Docker Desktop Linux VM, not macOS.
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.328.0
ENV DEBIAN_FRONTEND=noninteractive
ENV RUNNER_ALLOW_RUNASROOT=1

# Base tooling. The setup-go / setup-node / rust-toolchain actions install their
# own toolchains at job time, so only their prerequisites live here.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tar gzip git jq sudo unzip xz-utils \
      build-essential pkg-config libssl-dev \
      postgresql-client \
      iptables uidmap \
      python3 make \
    && rm -rf /var/lib/apt/lists/*

# Docker engine + CLI, for the daemon this container runs itself.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /actions-runner
RUN ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in amd64) RARCH=x64 ;; arm64) RARCH=arm64 ;; *) echo "unsupported arch $ARCH" >&2; exit 1 ;; esac \
    && curl -fsSL -o runner.tar.gz \
       "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RARCH}-${RUNNER_VERSION}.tar.gz" \
    && tar xzf runner.tar.gz && rm runner.tar.gz \
    && apt-get update \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/*

# The runner's .NET needs libicu. Its own installdependencies.sh does NOT provide
# it on Ubuntu 24.04: the script probes for long-obsolete versions (libicu52 and
# friends), fails to find them, and exits successfully having installed nothing —
# so the runner starts and then dies with "Libicu's dependencies is missing for
# Dotnet Core". Install the package this release actually ships instead of
# trusting that script's exit code.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libicu74 \
    && rm -rf /var/lib/apt/lists/*

# Rust toolchain. GitHub's ubuntu-latest image ships Rust preinstalled, and some
# jobs rely on that without adding a rust-toolchain step — the Migrations job
# calls `cargo install sqlx-cli` directly and failed here with exit 127. Jobs
# that DO pin a toolchain still override this at job time.
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
    && chmod -R a+w "$RUSTUP_HOME" "$CARGO_HOME"

# Cap link-time parallelism. The Docker Desktop VM has ~4 GB, and cargo links one
# test binary per CPU (8 here); several concurrent linkers exhaust it and the
# kernel OOM-kills ld with "collect2: fatal error: ld terminated with signal 9".
# This changes only how many link steps run at once — every test still builds and
# still runs, so no check is weakened. Raise it if the VM is given more memory.
ENV CARGO_BUILD_JOBS=2

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
