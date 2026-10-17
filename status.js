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
        const allowed = ["idle", "connecting", "connected", "ready", "stopping", "stopped"];
        const value = String(status || "stopped").toLowerCase();
        return allowed.includes(value) ? value : "stopped";
    }

    function titleCase(value) {
        return String(value || "stopped").charAt(0).toUpperCase()
            + String(value || "stopped").slice(1).toLowerCase();
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
        return value === null || value === undefined || !Number.isFinite(latency) || latency < 0
            ? "—"
            : `${Math.round(latency)} ms`;
    }

    function formatUpdatedAt(value) {
        if (!value) return "Waiting for first update";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Update received";
        return `Updated ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    }

    function setOverallState(online, state) {
        const label = online ? "All systems operational" : "Service unavailable";
        elements.botStatusLabel.textContent = label;
        elements.statusDescription.textContent = online
            ? "Joinly is connected to Discord and reporting live metrics."
            : "Live bot data is currently unavailable. The bot may be offline or still starting.";

        const color = online ? "var(--ready)" : "var(--stopped)";
        elements.overallIcon.style.color = color;
        elements.overallIcon.style.background = online
            ? "rgba(56,201,139,.1)"
            : "rgba(239,100,100,.1)";
        elements.updatedDot.style.background = color;

        if (!online && state === "stopping") {
            elements.botStatusLabel.textContent = "Joinly is stopping";
            elements.statusDescription.textContent = "The bot is shutting down or restarting.";
            elements.overallIcon.style.color = "var(--stopping)";
            elements.overallIcon.style.background = "rgba(242,154,90,.1)";
            elements.updatedDot.style.background = "var(--stopping)";
        }
    }

    function createShardCard(shard) {
        const status = escapeStatusClass(shard.status);
        const card = document.createElement("article");
        card.className = `shard-card status-${status}`;
        card.tabIndex = 0;
        card.setAttribute("aria-label", `Shard ${shard.id}, ${titleCase(status)}`);

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
        guildValue.textContent = numberFormat.format(Number(shard.guildCount) || 0);
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
            `State: ${titleCase(status)} · Guilds: ${numberFormat.format(Number(shard.guildCount) || 0)} · ` +
            `Average latency: ${formatLatency(shard.averageLatencyMs)} · ` +
            `Uptime: ${formatDuration(shard.averageUptimeSeconds)}`;

        card.append(top, line, metrics, tooltip);
        return card;
    }

    function render(snapshot) {
        const shards = Array.isArray(snapshot.shards) ? snapshot.shards : [];
        const totalShards = Math.max(1, Number(snapshot.totalShards) || shards.length || 1);
        const readyCount = Number.isFinite(Number(snapshot.availableShards))
            ? Number(snapshot.availableShards)
            : shards.filter(shard => escapeStatusClass(shard.status) === "ready").length;

        const online = snapshot.available !== false
            && snapshot.botOnline === true
            && shards.some(shard => escapeStatusClass(shard.status) === "ready");

        const topState = shards.some(shard => escapeStatusClass(shard.status) === "stopping")
            ? "stopping"
            : (online ? "ready" : "stopped");

        setOverallState(online, topState);

        elements.guildCount.textContent = numberFormat.format(Number(snapshot.guildCount) || 0);
        elements.availableShards.textContent = `${readyCount}/${totalShards}`;
        elements.processUptime.textContent = snapshot.botOnline
            ? formatDuration(snapshot.processUptimeSeconds)
            : "Offline";
        elements.lastUpdated.textContent = formatUpdatedAt(snapshot.updatedAt);
        elements.shardCount.textContent = `${totalShards} ${totalShards === 1 ? "shard" : "shards"}`;

        elements.shardGrid.replaceChildren();
        if (!shards.length) {
            const empty = document.createElement("div");
            empty.className = "loading-card";
            empty.textContent = "No shard data is available yet.";
            elements.shardGrid.appendChild(empty);
            return;
        }

        shards.forEach(shard => elements.shardGrid.appendChild(createShardCard(shard)));
    }

    async function refreshStatus() {
        try {
            const response = await fetch(API_URL, {
                method: "GET",
                cache: "no-store",
                headers: { Accept: "application/json" }
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || `Status request failed (${response.status}).`);
            }

            render(data);
        } catch (error) {
            setOverallState(false, "stopped");
            elements.lastUpdated.textContent = "Unable to refresh status";
            elements.processUptime.textContent = "—";
            console.error("Joinly status refresh failed:", error);
        }
    }

    refreshStatus();
    window.setInterval(refreshStatus, REFRESH_INTERVAL_MS);
})();
