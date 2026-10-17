const STATUS_REDIS_KEY = "joinly:status";

function offlineSnapshot(message = "Waiting for the bot to publish its first update.") {
    return {
        available: false,
        message,
        botName: "Joinly",
        botOnline: false,
        guildCount: 0,
        totalShards: 1,
        availableShards: 0,
        shards: [
            {
                id: 1,
                status: "stopped",
                guildCount: 0,
                averageLatencyMs: null,
                averageUptimeSeconds: 0
            }
        ],
        updatedAt: null
    };
}

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed." });
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
            throw new Error(result.error || `Upstash returned HTTP ${response.status}.`);
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

        if (!snapshot || !Array.isArray(snapshot.shards)) {
            throw new Error("The saved status snapshot has an invalid format.");
        }

        return res.status(200).json({
            available: true,
            ...snapshot
        });
    } catch (error) {
        console.error("Status API error:", error.message);
        return res.status(502).json({
            error: "Unable to retrieve live status data."
        });
    }
};
