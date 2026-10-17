(() => {
    const REFRESH_INTERVAL_MS = 15_000;
    const API_URL = "/api/status";

    const elements = {
        botStatusLabel: document.getElementById("bot-status-label"),
        statusDescription: document.getElementById("status-description"),
        lastUpdated: document.getElementById("last-updated"),
        guildCount: document.getElementById("guild-count"),
        availableShards: document.getElementById("available-shards"),
        processUptime: document.getElementById("process-uptime"),
        shardCount: document.getElementById("shard-count"),
        shardGrid: document.getElementById("shard-grid"),
        overallIcon: document.querySelector(".overall-icon"),
        updatedDot: document.querySelector(".updated-dot")
    };

    const numberFormat = new Intl.NumberFormat();

    function escapeStatusClass(status) {
        const allowed = [
            "idle",
            "connecting",
            "connected",
            "ready",
            "stopping",
            "stopped"
        ];

        const value = String(status || "stopped").toLowerCase();

        return allowed.includes(value) ? value : "stopped";
    }

    function titleCase(value) {
        const text = String(value || "stopped");

        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function formatDuration(totalSeconds) {
        const seconds = Math.max(0, Number(totalSeconds) || 0);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;

        return `${remainingSeconds}s`;
    }

    function formatLatency(value) {
        const latency = Number(value);

        if (
            value === null ||
            value === undefined ||
            value === "" ||
            !Number.isFinite(latency) ||
            latency < 0
        ) {
            return "—";
        }

        return `${Math.round(latency)} ms`;
    }

    function formatUpdatedAt(value) {
        if (!value) return "Waiting for first update";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Update received";
        }

        return `Updated ${date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        })}`;
    }

    function setOverallState(state, description) {
        const states = {
            operational: {
                label: "All systems operational",
                description:
                    "All configured shards are ready and reporting live metrics.",
                color: "var(--ready)",
                background: "rgba(56,201,139,.1)"
            },
            degraded: {
                label: "Degraded performance",
                description:
                    "Some shards are unavailable or shard statistics are incomplete.",
                color: "var(--stopping)",
                background: "rgba(242,154,90,.1)"
            },
            offline: {
                label: "Service unavailable",
                description:
                    "No shards are ready, or live status data is unavailable.",
                color: "var(--stopped)",
                background: "rgba(239,100,100,.1)"
            },
            stopping: {
                label: "Joinly is stopping",
                description:
                    "The bot is shutting down or restarting.",
                color: "var(--stopping)",
                background: "rgba(242,154,90,.1)"
            },
            stale: {
                label: "Status data is stale",
                description:
                    "The latest bot update is too old to confirm current health.",
                color: "var(--stopping)",
                background: "rgba(242,154,90,.1)"
            },
            error: {
                label: "Unable to check status",
                description:
                    "The status service could not be reached. Please try again shortly.",
                color: "var(--stopped)",
                background: "rgba(239,100,100,.1)"
            }
        };

        const current = states[state] || states.offline;

        if (elements.botStatusLabel) {
            elements.botStatusLabel.textContent = current.label;
        }

        if (elements.statusDescription) {
            elements.statusDescription.textContent =
                description || current.description;
        }

        if (elements.overallIcon) {
            elements.overallIcon.style.color = current.color;
            elements.overallIcon.style.background = current.background;
        }

        if (elements.updatedDot) {
            elements.updatedDot.style.background = current.color;
        }
    }

    function createShardCard(shard) {
        const status = escapeStatusClass(shard.status);

        const card = document.createElement("article");
        card.className = `shard-card status-${status}`;
        card.tabIndex = 0;
        card.setAttribute(
            "aria-label",
            `Shard ${shard.id}, ${titleCase(status)}`
        );

        const top = document.createElement("div");
        top.className = "shard-card-top";

        const name = document.createElement("div");
        name.className = "shard-name";

        const mark = document.createElement("span");
        mark.className = "shard-mark";
        mark.textContent = String(shard.id);

        const title = document.createElement("span");
        title.textContent = `Shard ${shard.id}`;

        name.append(mark, title);

        const pill = document.createElement("span");
        pill.className = "status-pill";
        pill.textContent = titleCase(status);

        top.append(name, pill);

        const line = document.createElement("div");
        line.className = "shard-status-line";

        const lineFill = document.createElement("span");
        line.appendChild(lineFill);

        const metrics = document.createElement("div");
        metrics.className = "shard-metrics";

        const guildMetric = document.createElement("div");

        const guildLabel = document.createElement("span");
        guildLabel.className = "shard-metric-label";
        guildLabel.textContent = "Guilds";

        const guildValue = document.createElement("span");
        guildValue.className = "shard-metric-value";
        guildValue.textContent = numberFormat.format(
            Math.max(0, Number(shard.guildCount) || 0)
        );

        guildMetric.append(guildLabel, guildValue);

        const latencyMetric = document.createElement("div");

        const latencyLabel = document.createElement("span");
        latencyLabel.className = "shard-metric-label";
        latencyLabel.textContent = "Average latency";

        const latencyValue = document.createElement("span");
        latencyValue.className = "shard-metric-value";
        latencyValue.textContent = formatLatency(shard.averageLatencyMs);

        latencyMetric.append(latencyLabel, latencyValue);
        metrics.append(guildMetric, latencyMetric);

        const tooltip = document.createElement("div");
        tooltip.className = "shard-tooltip";
        tooltip.textContent =
            `State: ${titleCase(status)} · ` +
            `Guilds: ${numberFormat.format(Number(shard.guildCount) || 0)} · ` +
            `Average latency: ${formatLatency(shard.averageLatencyMs)} · ` +
            `Uptime: ${formatDuration(shard.averageUptimeSeconds)}`;

        card.append(top, line, metrics, tooltip);

        return card;
    }

    function renderShardGrid(shards) {
        if (!elements.shardGrid) return;

        const fragment = document.createDocumentFragment();

        if (!shards.length) {
            const empty = document.createElement("div");
            empty.className = "loading-card";
            empty.textContent = "No shard statistics are available.";
            fragment.appendChild(empty);
        } else {
            shards
                .slice()
                .sort((a, b) => a.id - b.id)
                .forEach(shard => {
                    fragment.appendChild(createShardCard(shard));
                });
        }

        elements.shardGrid.replaceChildren(fragment);
    }

    function render(snapshot) {
        const configuredTotal = Number(snapshot.totalShards);

        const totalShards =
            Number.isInteger(configuredTotal) && configuredTotal > 0
                ? configuredTotal
                : null;

        /*
         * The bot publishes one-based shard IDs:
         * 1 through totalShards.
         */
        const shards = Array.isArray(snapshot.shards)
            ? snapshot.shards.filter(shard =>
                shard &&
                Number.isInteger(shard.id) &&
                totalShards !== null &&
                shard.id >= 1 &&
                shard.id <= totalShards &&
                typeof shard.status === "string" &&
                Number.isFinite(Number(shard.guildCount)) &&
                Number(shard.guildCount) >= 0
            )
            : [];

        const uniqueShards = [
            ...new Map(shards.map(shard => [shard.id, shard])).values()
        ];

        const readyCount = uniqueShards.filter(
            shard => escapeStatusClass(shard.status) === "ready"
        ).length;

        const statisticsComplete =
            snapshot.statisticsComplete === true &&
            totalShards !== null &&
            uniqueShards.length === totalShards &&
            readyCount === totalShards;

        let state;

        if (snapshot.stale === true) {
            state = "stale";
        } else if (snapshot.health === "stopping") {
            state = "stopping";
        } else if (snapshot.available === false) {
            state = "offline";
        } else if (readyCount === 0) {
            state = "offline";
        } else if (
            snapshot.health === "degraded" ||
            !statisticsComplete ||
            snapshot.botOnline !== true
        ) {
            state = "degraded";
        } else {
            state = "operational";
        }

        let description;

        if (state === "degraded") {
            const missingCount = totalShards === null
                ? null
                : Math.max(0, totalShards - uniqueShards.length);

            if (missingCount > 0) {
                description =
                    `${readyCount} shard(s) ready. ` +
                    `${missingCount} shard(s) have no reported statistics.`;
            } else {
                description =
                    `${readyCount} of ${totalShards ?? "unknown"} configured shards are ready.`;
            }
        } else if (state === "stale") {
            description =
                snapshot.message ||
                "The latest bot update is too old to confirm current health.";
        } else if (state === "offline" && snapshot.message) {
            description = snapshot.message;
        }

        setOverallState(state, description);

        if (elements.guildCount) {
            elements.guildCount.textContent = numberFormat.format(
                Math.max(0, Number(snapshot.guildCount) || 0)
            );
        }

        if (elements.availableShards) {
            elements.availableShards.textContent =
                `${readyCount}/${totalShards ?? "?"}`;
        }

        if (elements.processUptime) {
            elements.processUptime.textContent =
                snapshot.botOnline === true &&
                state !== "stale" &&
                state !== "offline"
                    ? formatDuration(snapshot.processUptimeSeconds)
                    : "Offline";
        }

        if (elements.lastUpdated) {
            elements.lastUpdated.textContent = snapshot.stale === true
                ? "Latest update is stale"
                : formatUpdatedAt(snapshot.updatedAt);
        }

        if (elements.shardCount) {
            elements.shardCount.textContent = totalShards === null
                ? `${uniqueShards.length} reported`
                : `${totalShards} ${totalShards === 1 ? "shard" : "shards"}`;
        }

        renderShardGrid(uniqueShards);
    }

    async function refreshStatus() {
        try {
            const response = await fetch(API_URL, {
                method: "GET",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.error || `Status request failed (${response.status}).`
                );
            }

            render(data);
        } catch (error) {
            setOverallState("error");

            if (elements.lastUpdated) {
                elements.lastUpdated.textContent = "Unable to refresh status";
            }

            if (elements.processUptime) {
                elements.processUptime.textContent = "—";
            }

            console.error("Joinly status refresh failed:", error);
        }
    }

    refreshStatus();
    window.setInterval(refreshStatus, REFRESH_INTERVAL_MS);
})();
