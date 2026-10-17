const STATUS_REDIS_KEY = "joinly:status";
const STALE_AFTER_MS = 75_000;

function offlineSnapshot(message = "Waiting for the bot to publish its first update.") {
    return {
        available: false,
        message,
        botName: "Joinly",
        botOnline: false,
        health: "offline",
        statisticsComplete: false,
        guildCount: 0,
        totalShards: null,
        availableShards: 0,
        missingShardIds: [],
        shards: [],
        processUptimeSeconds: null,
        updatedAt: null,
        stale: false
    };
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

/*
 * Joinly's bot publisher sends one-based shard IDs:
 * 1 through totalShards.
 *
 * Keep this convention consistent throughout the website.
 */
function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return false;
    }

    if (
        !Array.isArray(snapshot.shards) ||
        !isNonNegativeInteger(snapshot.totalShards) ||
        snapshot.totalShards < 1 ||
        !isNonNegativeInteger(snapshot.availableShards) ||
        !isNonNegativeInteger(snapshot.guildCount) ||
        typeof snapshot.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(snapshot.updatedAt))
    ) {
        return false;
    }

    const seenShardIds = new Set();

    for (const shard of snapshot.shards) {
        if (
            !shard ||
            !Number.isInteger(shard.id) ||
            shard.id < 1 ||
            shard.id > snapshot.totalShards ||
            typeof shard.status !== "string" ||
            !isNonNegativeInteger(shard.guildCount)
        ) {
            return false;
        }

        if (seenShardIds.has(shard.id)) {
            return false;
        }

        seenShardIds.add(shard.id);
    }

    if (snapshot.missingShardIds !== undefined) {
        if (
            !Array.isArray(snapshot.missingShardIds) ||
            !snapshot.missingShardIds.every(
                id =>
                    Number.isInteger(id) &&
                    id >= 1 &&
                    id <= snapshot.totalShards
            )
        ) {
            return false;
        }
    }

    return true;
}

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");

        return res.status(405).json({
            error: "Method not allowed."
        });
    }

    const restUrl = process.env.UPSTASH_REDIS_REST_URL;
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!restUrl || !restToken) {
        return res.status(500).json({
            error: "Status API is not configured. Add the Upstash REST environment variables in Vercel."
        });
    }

    try {
        const response = await fetch(restUrl.replace(/\/+$/, ""), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${restToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(["GET", STATUS_REDIS_KEY])
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(
                result.error || `Upstash returned HTTP ${response.status}.`
            );
        }

        if (!result.result) {
            return res.status(200).json(offlineSnapshot());
        }

        let snapshot;

        try {
            snapshot = JSON.parse(result.result);
        } catch {
            throw new Error("The saved status snapshot is not valid JSON.");
        }

        if (!validateSnapshot(snapshot)) {
            throw new Error("The saved status snapshot has an invalid format.");
        }

        const ageMs = Date.now() - Date.parse(snapshot.updatedAt);
        const stale = ageMs < 0 || ageMs > STALE_AFTER_MS;

        if (stale) {
            return res.status(200).json({
                ...snapshot,
                available: false,
                botOnline: false,
                health: "offline",
                stale: true,
                message: "Status data is stale. Waiting for a fresh bot update."
            });
        }

        const readyShards = snapshot.shards.filter(
            shard => shard.status === "ready"
        ).length;

        const statisticsComplete =
            snapshot.statisticsComplete !== false &&
            snapshot.shards.length === snapshot.totalShards &&
            readyShards === snapshot.totalShards;

        let health;

        if (snapshot.health === "stopping") {
            health = "stopping";
        } else if (readyShards === 0) {
            health = "offline";
        } else if (
            readyShards < snapshot.totalShards ||
            !statisticsComplete
        ) {
            health = "degraded";
        } else {
            health = "operational";
        }

        return res.status(200).json({
            ...snapshot,
            available: true,
            botOnline: readyShards > 0 && health !== "stopping",
            availableShards: readyShards,
            statisticsComplete,
            health,
            stale: false
        });
    } catch (error) {
        console.error("Status API error:", error.message);

        return res.status(502).json({
            error: "Unable to retrieve live status data."
        });
    }
};
