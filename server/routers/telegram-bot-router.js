const express = require("express");
const router = express.Router();
const axios = require("axios");
const { R } = require("redbean-node");
const { UptimeKumaServer } = require("../uptime-kuma-server");
const Monitor = require("../model/monitor");
const { log } = require("../../src/util");
const cron = require("node-cron");

// Store active report jobs
const activeReportJobs = new Map();

// Store active polling intervals
const activePollingJobs = new Map();

// Store last update ID for each bot to avoid processing duplicates
const lastUpdateIds = new Map();

/**
 * Telegram Bot Router - Handles incoming webhook commands
 */

/**
 * Send a message to Telegram with optional inline keyboard
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Chat ID to send message to
 * @param {string} text - Message text
 * @param {object} keyboard - Optional inline keyboard
 * @returns {Promise<void>}
 */
async function sendTelegramMessage(botToken, chatId, text, keyboard = null) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const params = {
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
    };

    if (keyboard) {
        params.reply_markup = JSON.stringify(keyboard);
    }

    await axios.post(url, params);
}

/**
 * Edit an existing Telegram message
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Chat ID
 * @param {number} messageId - Message ID to edit
 * @param {string} text - New message text
 * @param {object} keyboard - Optional inline keyboard
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function editTelegramMessage(botToken, chatId, messageId, text, keyboard = null) {
    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    const params = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: "HTML",
    };

    if (keyboard) {
        params.reply_markup = JSON.stringify(keyboard);
    }

    try {
        await axios.post(url, params);
        return true;
    } catch (error) {
        // Handle common errors silently
        const errMsg = error.response?.data?.description || "";

        if (errMsg.includes("message is not modified")) {
            // Content is the same, not an error
            return true;
        }

        if (errMsg.includes("message to edit not found") ||
            errMsg.includes("message can't be edited")) {
            // Message was deleted or too old, send new message instead
            log.warn("telegram-bot", `Cannot edit message, sending new one: ${errMsg}`);
            await sendTelegramMessage(botToken, chatId, text, keyboard);
            return true;
        }

        // Log other errors
        log.error("telegram-bot", `Edit message error: ${errMsg}`);
        return false;
    }
}

/**
 * Answer callback query (removes loading state from button)
 * @param {string} botToken - Telegram bot token
 * @param {string} callbackQueryId - Callback query ID
 * @param {string} text - Optional toast text
 * @returns {Promise<void>}
 */
async function answerCallbackQuery(botToken, callbackQueryId, text = "") {
    try {
        const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
        await axios.post(url, {
            callback_query_id: callbackQueryId,
            text: text,
        });
    } catch (error) {
        // Callback queries can expire, ignore errors silently
    }
}

/**
 * Get status symbol for monitor status
 * @param {number} status - Monitor status (0=down, 1=up, 2=pending, 3=maintenance)
 * @returns {string} Symbol
 */
function getStatusEmoji(status) {
    switch (status) {
        case 1: return "●";  // Filled circle for online
        case 0: return "○";  // Empty circle for offline
        case 2: return "◐";  // Half circle for pending
        case 3: return "◆";  // Diamond for maintenance
        default: return "◌";  // Dotted circle for unknown
    }
}

/**
 * Get status text for monitor status
 * @param {number} status - Monitor status
 * @returns {string} Status text
 */
function getStatusText(status) {
    switch (status) {
        case 1: return "UP";
        case 0: return "DOWN";
        case 2: return "PENDING";
        case 3: return "MAINTENANCE";
        default: return "UNKNOWN";
    }
}

/**
 * Get authorized notification configs for a chat ID
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<object|null>} Notification config or null
 */
async function getAuthorizedNotification(chatId) {
    const notification = await R.findOne("notification", " config LIKE ? ", [
        `%"telegramChatID":"${chatId}"%`
    ]);

    if (notification) {
        return {
            ...notification,
            config: JSON.parse(notification.config || "{}")
        };
    }
    return null;
}

/**
 * Get all monitors with their latest heartbeat
 * @returns {Promise<Array>} Array of monitors with status
 */
async function getAllMonitorsWithStatus() {
    const monitors = await R.find("monitor", " active = 1 ");
    const result = [];

    for (const monitor of monitors) {
        const heartbeat = await R.findOne("heartbeat", " monitor_id = ? ORDER BY time DESC ", [monitor.id]);
        result.push({
            id: monitor.id,
            name: monitor.name,
            url: monitor.url,
            type: monitor.type,
            active: monitor.active,
            status: heartbeat ? heartbeat.status : 2,
            ping: heartbeat ? heartbeat.ping : null,
            msg: heartbeat ? heartbeat.msg : null,
        });
    }

    return result;
}

/**
 * Get monitor uptime percentage
 * @param {number} monitorId - Monitor ID
 * @param {number} hours - Hours to calculate uptime for
 * @returns {Promise<number>} Uptime percentage
 */
async function getMonitorUptime(monitorId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const total = await R.count("heartbeat", " monitor_id = ? AND time >= ? ", [monitorId, since]);
    const up = await R.count("heartbeat", " monitor_id = ? AND time >= ? AND status = 1 ", [monitorId, since]);

    if (total === 0) return 100;
    return Math.round((up / total) * 10000) / 100;
}

/**
 * Handle /status command
 * @param {string} botToken - Bot token
 * @param {string} chatId - Chat ID
 * @param {number} messageId - Message ID to edit (optional)
 * @returns {Promise<void>}
 */
async function handleStatusCommand(botToken, chatId, messageId = null) {
    const monitors = await getAllMonitorsWithStatus();

    if (monitors.length === 0) {
        const msg = "<b>Nessun monitor configurato</b>";
        if (messageId) {
            await editTelegramMessage(botToken, chatId, messageId, msg);
        } else {
            await sendTelegramMessage(botToken, chatId, msg);
        }
        return;
    }

    // Count status
    const online = monitors.filter(m => m.status === 1).length;
    const offline = monitors.filter(m => m.status === 0).length;

    let message = "<b>UPTIME KUMA</b>\n";
    message += "─────────────────────\n\n";

    // Summary line
    message += `<code>● ${online} UP   ○ ${offline} DOWN</code>\n\n`;

    const buttons = [];

    for (const monitor of monitors) {
        const symbol = getStatusEmoji(monitor.status);
        const status = getStatusText(monitor.status);
        const uptime = await getMonitorUptime(monitor.id, 24);
        const ping = monitor.ping ? `${monitor.ping}ms` : "—";

        message += `${symbol} <b>${monitor.name}</b>  <code>${status}</code>\n`;
        message += `    ${uptime}%  ·  ${ping}\n\n`;

        buttons.push([{
            text: `${symbol} ${monitor.name}`,
            callback_data: `check_${monitor.id}`
        }]);
    }

    message += "─────────────────────";

    // Add refresh and stats buttons
    buttons.push([
        { text: "↻ Aggiorna", callback_data: "refresh_status" },
        { text: "≡ Stats", callback_data: "show_stats" }
    ]);

    const keyboard = { inline_keyboard: buttons };

    if (messageId) {
        await editTelegramMessage(botToken, chatId, messageId, message, keyboard);
    } else {
        await sendTelegramMessage(botToken, chatId, message, keyboard);
    }
}

/**
 * Handle /check command for specific monitor
 * @param {string} botToken - Bot token
 * @param {string} chatId - Chat ID
 * @param {number} monitorId - Monitor ID
 * @param {number} messageId - Message ID to edit (optional)
 * @returns {Promise<void>}
 */
async function handleCheckCommand(botToken, chatId, monitorId, messageId = null) {
    const monitor = await R.findOne("monitor", " id = ? ", [monitorId]);

    if (!monitor) {
        const msg = "<b>Monitor non trovato</b>";
        if (messageId) {
            await editTelegramMessage(botToken, chatId, messageId, msg);
        } else {
            await sendTelegramMessage(botToken, chatId, msg);
        }
        return;
    }

    const heartbeat = await R.findOne("heartbeat", " monitor_id = ? ORDER BY time DESC ", [monitor.id]);
    const status = heartbeat ? heartbeat.status : 2;
    const symbol = getStatusEmoji(status);
    const statusText = getStatusText(status);
    const uptime24h = await getMonitorUptime(monitor.id, 24);
    const uptime7d = await getMonitorUptime(monitor.id, 24 * 7);
    const uptime30d = await getMonitorUptime(monitor.id, 24 * 30);

    let message = `${symbol} <b>${monitor.name}</b>  <code>${statusText}</code>\n`;
    message += "─────────────────────\n\n";

    message += `<b>Tipo:</b> ${monitor.type}\n`;
    if (monitor.url) {
        message += `<b>URL:</b> <code>${monitor.url}</code>\n`;
    }
    message += "\n";

    message += `<b>Uptime</b>\n`;
    message += `  24h:     <code>${uptime24h}%</code>\n`;
    message += `  7 days:  <code>${uptime7d}%</code>\n`;
    message += `  30 days: <code>${uptime30d}%</code>\n\n`;

    if (heartbeat) {
        message += `<b>Ping:</b> ${heartbeat.ping || "—"}ms\n`;
        message += `<b>Last check:</b> ${new Date(heartbeat.time).toLocaleString("it-IT")}\n`;
        if (heartbeat.msg && status === 0) {
            message += `\n<b>Error:</b> <code>${heartbeat.msg}</code>\n`;
        }
    }

    message += "\n─────────────────────";

    const buttons = [
        [
            { text: monitor.active ? "❚❚ Pause" : "► Resume", callback_data: `toggle_${monitor.id}` },
            { text: "↻ Refresh", callback_data: `check_${monitor.id}` }
        ],
        [
            { text: "← Back", callback_data: "refresh_status" }
        ]
    ];

    const keyboard = { inline_keyboard: buttons };

    if (messageId) {
        await editTelegramMessage(botToken, chatId, messageId, message, keyboard);
    } else {
        await sendTelegramMessage(botToken, chatId, message, keyboard);
    }
}

/**
 * Handle /stats command
 * @param {string} botToken - Bot token
 * @param {string} chatId - Chat ID
 * @param {number} messageId - Message ID to edit (optional)
 * @returns {Promise<void>}
 */
async function handleStatsCommand(botToken, chatId, messageId = null) {
    const monitors = await getAllMonitorsWithStatus();

    const total = monitors.length;
    const up = monitors.filter(m => m.status === 1).length;
    const down = monitors.filter(m => m.status === 0).length;
    const maintenance = monitors.filter(m => m.status === 3).length;
    const pending = monitors.filter(m => m.status === 2).length;

    let totalUptime = 0;
    for (const monitor of monitors) {
        totalUptime += await getMonitorUptime(monitor.id, 24);
    }
    const avgUptime = total > 0 ? Math.round(totalUptime / total * 100) / 100 : 0;

    // Visual uptime bar
    const uptimeBar = generateUptimeBar(avgUptime);

    let message = "<b>STATISTICS</b>\n";
    message += "─────────────────────\n\n";

    message += `<b>Total Monitors:</b> ${total}\n\n`;

    message += `● UP:          <code>${up}</code>\n`;
    message += `○ DOWN:        <code>${down}</code>\n`;
    message += `◆ MAINTENANCE: <code>${maintenance}</code>\n`;
    message += `◐ PENDING:     <code>${pending}</code>\n\n`;

    message += `<b>Avg Uptime (24h)</b>\n`;
    message += `<code>${uptimeBar}</code> <b>${avgUptime}%</b>\n\n`;

    message += "─────────────────────";

    const buttons = [
        [
            { text: "≡ Monitors", callback_data: "refresh_status" },
            { text: "↻ Refresh", callback_data: "show_stats" }
        ]
    ];

    const keyboard = { inline_keyboard: buttons };

    if (messageId) {
        await editTelegramMessage(botToken, chatId, messageId, message, keyboard);
    } else {
        await sendTelegramMessage(botToken, chatId, message, keyboard);
    }
}

/**
 * Generate a visual uptime bar
 * @param {number} percentage - Uptime percentage
 * @returns {string} Visual bar
 */
function generateUptimeBar(percentage) {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Handle pause/resume toggle
 * @param {string} botToken - Bot token
 * @param {string} chatId - Chat ID
 * @param {number} monitorId - Monitor ID
 * @param {number} messageId - Message ID
 * @returns {Promise<void>}
 */
async function handleToggleCommand(botToken, chatId, monitorId, messageId) {
    const monitor = await R.findOne("monitor", " id = ? ", [monitorId]);

    if (!monitor) {
        await answerCallbackQuery(botToken, "", "Monitor non trovato");
        return;
    }

    // Toggle active status
    monitor.active = monitor.active ? 0 : 1;
    await R.store(monitor);

    // Note: We don't call sendMonitorList here because we don't have a socket context
    // The monitor state is saved in the database and will be reflected on next check

    // Refresh the check view
    await handleCheckCommand(botToken, chatId, monitorId, messageId);
}

/**
 * Handle /help command
 * @param {string} botToken - Bot token
 * @param {string} chatId - Chat ID
 * @returns {Promise<void>}
 */
async function handleHelpCommand(botToken, chatId) {
    let message = "<b>UPTIME KUMA BOT</b>\n";
    message += "─────────────────────\n\n";

    message += "<b>Commands</b>\n\n";

    message += "/status\n";
    message += "  <i>Show all monitors</i>\n\n";

    message += "/check <code>name</code>\n";
    message += "  <i>Monitor details</i>\n\n";

    message += "/stats\n";
    message += "  <i>General statistics</i>\n\n";

    message += "/help\n";
    message += "  <i>Show this message</i>\n\n";

    message += "─────────────────────\n";
    message += "<i>Use buttons to navigate</i>";

    const buttons = [
        [
            { text: "≡ Status", callback_data: "refresh_status" },
            { text: "≡ Stats", callback_data: "show_stats" }
        ]
    ];

    const keyboard = { inline_keyboard: buttons };
    await sendTelegramMessage(botToken, chatId, message, keyboard);
}

/**
 * Process incoming Telegram update
 * @param {object} update - Telegram update object
 * @param {object} notification - Notification config
 * @returns {Promise<void>}
 */
async function processUpdate(update, notification) {
    const botToken = notification.config.telegramBotToken;
    const authorizedChatId = notification.config.telegramChatID;

    // Handle regular messages (commands)
    if (update.message) {
        const chatId = update.message.chat.id.toString();
        const text = update.message.text || "";

        // Check authorization
        if (chatId !== authorizedChatId) {
            await sendTelegramMessage(botToken, chatId, "⛔ Non sei autorizzato a usare questo bot.");
            return;
        }

        // Parse command
        const command = text.split(" ")[0].toLowerCase();
        const args = text.split(" ").slice(1).join(" ");

        switch (command) {
            case "/status":
            case "/start":
                await handleStatusCommand(botToken, chatId);
                break;
            case "/check":
                if (args) {
                    // Find monitor by name
                    const monitor = await R.findOne("monitor", " LOWER(name) LIKE ? ", [`%${args.toLowerCase()}%`]);
                    if (monitor) {
                        await handleCheckCommand(botToken, chatId, monitor.id);
                    } else {
                        await sendTelegramMessage(botToken, chatId, `❌ Monitor "${args}" non trovato`);
                    }
                } else {
                    await sendTelegramMessage(botToken, chatId, "❌ Uso: /check <nome monitor>");
                }
                break;
            case "/stats":
                await handleStatsCommand(botToken, chatId);
                break;
            case "/help":
                await handleHelpCommand(botToken, chatId);
                break;
            default:
                if (text.startsWith("/")) {
                    await sendTelegramMessage(botToken, chatId, "❓ Comando non riconosciuto. Usa /help per la lista comandi.");
                }
        }
    }

    // Handle callback queries (button presses)
    if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id.toString();
        const messageId = update.callback_query.message.message_id;
        const data = update.callback_query.data;
        const callbackQueryId = update.callback_query.id;

        // Check authorization
        if (chatId !== authorizedChatId) {
            await answerCallbackQuery(botToken, callbackQueryId, "Non autorizzato");
            return;
        }

        try {
            if (data === "refresh_status") {
                // Edit the same message instead of sending a new one
                await handleStatusCommand(botToken, chatId, messageId);
                await answerCallbackQuery(botToken, callbackQueryId, "Aggiornato!");
            } else if (data === "show_stats" || data === "refresh_stats") {
                // Edit the same message to show stats
                await handleStatsCommand(botToken, chatId, messageId);
                await answerCallbackQuery(botToken, callbackQueryId, "Aggiornato!");
            } else if (data.startsWith("check_")) {
                const monitorId = parseInt(data.replace("check_", ""));
                await handleCheckCommand(botToken, chatId, monitorId, messageId);
                await answerCallbackQuery(botToken, callbackQueryId);
            } else if (data.startsWith("toggle_")) {
                const monitorId = parseInt(data.replace("toggle_", ""));
                await handleToggleCommand(botToken, chatId, monitorId, messageId);
                await answerCallbackQuery(botToken, callbackQueryId, "Monitor aggiornato!");
            }
        } catch (error) {
            log.error("telegram-bot", `Error handling callback: ${error.message}`);
            await answerCallbackQuery(botToken, callbackQueryId, "Errore!");
        }
    }
}

// Track 409 errors to stop polling if too many
const polling409Errors = new Map();

/**
 * Poll for Telegram updates using getUpdates API
 * @param {object} notification - Notification object with config
 * @returns {Promise<void>}
 */
async function pollTelegramUpdates(notification) {
    try {
        const config = notification.config || JSON.parse(notification.configJson || "{}");
        const botToken = config.telegramBotToken;

        if (!botToken) return;

        const lastUpdateId = lastUpdateIds.get(botToken) || 0;
        const url = `https://api.telegram.org/bot${botToken}/getUpdates`;

        const response = await axios.post(url, {
            offset: lastUpdateId + 1,
            timeout: 30,  // Long polling - wait up to 30 seconds
            allowed_updates: ["message", "callback_query"]
        }, { timeout: 35000 });  // Slightly longer than Telegram timeout

        // Reset error counter on success
        polling409Errors.set(botToken, 0);

        if (response.data.ok && response.data.result.length > 0) {
            for (const update of response.data.result) {
                // Update the last processed ID
                lastUpdateIds.set(botToken, update.update_id);

                // Process the update
                try {
                    await processUpdate(update, { ...notification, config });
                } catch (processError) {
                    log.error("telegram-bot", `Error processing update: ${processError.message}`);
                }
            }
        }
    } catch (error) {
        // Handle 409 Conflict error (webhook still active or another instance polling)
        if (error.response && error.response.status === 409) {
            const config = notification.config || JSON.parse(notification.configJson || "{}");
            const botToken = config.telegramBotToken;
            const errorCount = (polling409Errors.get(botToken) || 0) + 1;
            polling409Errors.set(botToken, errorCount);

            log.warn("telegram-bot", `409 Conflict (attempt ${errorCount}/5) - trying to clear webhook again...`);

            // Try to delete webhook again
            try {
                await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
                    drop_pending_updates: true
                });
            } catch (e) {
                // Ignore
            }

            // If too many errors, stop polling for this notification
            if (errorCount >= 5) {
                log.error("telegram-bot", `Too many 409 errors, stopping polling for notification ${notification.id}`);
                stopPolling(notification.id);
            }
        } else if (!error.message.includes("timeout") && !error.message.includes("ETIMEDOUT")) {
            log.error("telegram-bot", `Polling error: ${error.message}`);
        }
    }
}

/**
 * Start polling for a notification
 * @param {number} notificationId - Notification ID
 * @returns {Promise<void>}
 */
async function startPolling(notificationId) {
    // Stop existing polling if any
    stopPolling(notificationId);

    const notification = await R.findOne("notification", " id = ? ", [notificationId]);
    if (!notification) return;

    const config = JSON.parse(notification.config || "{}");

    if (!config.telegramBotToken || !config.telegramEnableBotCommands) return;

    // First, remove any existing webhook to enable polling
    try {
        const url = `https://api.telegram.org/bot${config.telegramBotToken}/deleteWebhook`;
        const response = await axios.post(url, { drop_pending_updates: true });
        log.info("telegram-bot", `Webhook removal response: ${JSON.stringify(response.data)}`);

        // Wait longer for Telegram to process the webhook removal
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify webhook is removed
        const infoUrl = `https://api.telegram.org/bot${config.telegramBotToken}/getWebhookInfo`;
        const infoResponse = await axios.get(infoUrl);
        log.info("telegram-bot", `Webhook info: ${JSON.stringify(infoResponse.data)}`);

        if (infoResponse.data.result && infoResponse.data.result.url) {
            log.warn("telegram-bot", `Webhook still active: ${infoResponse.data.result.url}`);
            return;
        }
    } catch (error) {
        log.error("telegram-bot", `Could not remove webhook: ${error.message}`);
        return;
    }

    // Reset 409 error counter
    polling409Errors.set(config.telegramBotToken, 0);

    // Use sequential polling instead of setInterval to avoid overlapping requests
    let isRunning = true;
    const pollLoop = async () => {
        while (isRunning && activePollingJobs.has(notificationId)) {
            await pollTelegramUpdates({ ...notification, config });
            // Small delay between polls
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    };

    // Store a flag object so we can stop it later
    activePollingJobs.set(notificationId, {
        stop: () => { isRunning = false; }
    });

    log.info("telegram-bot", `Polling started for notification ${notificationId}`);

    // Start the polling loop (don't await, let it run in background)
    pollLoop();
}

/**
 * Stop polling for a notification
 * @param {number} notificationId - Notification ID
 */
function stopPolling(notificationId) {
    const pollingJob = activePollingJobs.get(notificationId);
    if (pollingJob) {
        if (typeof pollingJob.stop === "function") {
            pollingJob.stop();
        } else if (typeof pollingJob === "number" || pollingJob._idleTimeout !== undefined) {
            // Old interval-based approach
            clearInterval(pollingJob);
        }
        activePollingJobs.delete(notificationId);
        log.info("telegram-bot", `Polling stopped for notification ${notificationId}`);
    }
}

/**
 * Initialize polling for all enabled Telegram notifications
 * @returns {Promise<void>}
 */
async function initPolling() {
    try {
        const notifications = await R.find("notification", " config LIKE ? ", ['%"telegramBotToken"%']);

        for (const notification of notifications) {
            const config = JSON.parse(notification.config || "{}");
            if (config.telegramEnableBotCommands) {
                await startPolling(notification.id);
            }
        }

        log.info("telegram-bot", `Initialized polling for ${activePollingJobs.size} notification(s)`);
    } catch (error) {
        log.error("telegram-bot", `Init polling error: ${error.message}`);
    }
}

/**
 * Webhook endpoint for Telegram
 */
router.post("/webhook/:notificationId", async (req, res) => {
    try {
        const notificationId = req.params.notificationId;
        const update = req.body;

        // Get notification config
        const notification = await R.findOne("notification", " id = ? ", [notificationId]);

        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");

        // Check if it's a Telegram notification (by checking config content)
        if (!config.telegramBotToken) {
            return res.status(400).json({ error: "Not a Telegram notification" });
        }

        // Process the update
        await processUpdate(update, { ...notification, config });

        res.json({ ok: true });
    } catch (error) {
        log.error("telegram-bot", `Webhook error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to set up webhook for a notification
 */
router.post("/setup-webhook/:notificationId", async (req, res) => {
    try {
        const notificationId = req.params.notificationId;
        const { baseUrl } = req.body;

        // Get notification config
        const notification = await R.findOne("notification", " id = ? ", [notificationId]);

        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");

        // Check if it's a Telegram notification (by checking config content)
        if (!config.telegramBotToken) {
            return res.status(400).json({ error: "Not a Telegram notification" });
        }

        // Set webhook URL
        const webhookUrl = `${baseUrl}/api/telegram-bot/webhook/${notificationId}`;
        const telegramUrl = `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`;

        const response = await axios.post(telegramUrl, {
            url: webhookUrl,
            allowed_updates: ["message", "callback_query"]
        });

        if (response.data.ok) {
            res.json({ ok: true, webhookUrl });
        } else {
            res.status(400).json({ error: response.data.description });
        }
    } catch (error) {
        log.error("telegram-bot", `Setup webhook error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to remove webhook
 */
router.post("/remove-webhook/:notificationId", async (req, res) => {
    try {
        const notificationId = req.params.notificationId;

        // Get notification config
        const notification = await R.findOne("notification", " id = ? ", [notificationId]);

        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");

        // Check if it's a Telegram notification (by checking config content)
        if (!config.telegramBotToken) {
            return res.status(400).json({ error: "Not a Telegram notification" });
        }

        // Remove webhook
        const telegramUrl = `https://api.telegram.org/bot${config.telegramBotToken}/deleteWebhook`;
        await axios.post(telegramUrl);

        res.json({ ok: true });
    } catch (error) {
        log.error("telegram-bot", `Remove webhook error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Send auto report to a chat
 * @param {object} notification - Notification config
 * @returns {Promise<void>}
 */
async function sendAutoReport(notification) {
    try {
        const config = notification.config;
        const botToken = config.telegramBotToken;
        const chatId = config.telegramChatID;

        const monitors = await getAllMonitorsWithStatus();

        const total = monitors.length;
        const up = monitors.filter(m => m.status === 1).length;
        const down = monitors.filter(m => m.status === 0).length;

        let totalUptime = 0;
        for (const monitor of monitors) {
            totalUptime += await getMonitorUptime(monitor.id, 24);
        }
        const avgUptime = total > 0 ? Math.round(totalUptime / total * 100) / 100 : 0;

        const now = new Date().toLocaleString("it-IT");

        let message = `📊 <b>Report Automatico</b>\n`;
        message += `<i>${now}</i>\n\n`;
        message += `<b>Riepilogo:</b>\n`;
        message += `✅ Online: ${up}/${total}\n`;
        message += `❌ Offline: ${down}\n`;
        message += `📈 Uptime medio (24h): ${avgUptime}%\n\n`;

        if (down > 0) {
            message += `<b>⚠️ Monitor Offline:</b>\n`;
            for (const monitor of monitors.filter(m => m.status === 0)) {
                message += `• ${monitor.name}\n`;
            }
        }

        const buttons = [[{ text: "📊 Dettagli completi", callback_data: "refresh_status" }]];
        const keyboard = { inline_keyboard: buttons };

        await sendTelegramMessage(botToken, chatId, message, keyboard);
        log.info("telegram-bot", `Auto report sent to ${chatId}`);
    } catch (error) {
        log.error("telegram-bot", `Auto report error: ${error.message}`);
    }
}

/**
 * Get cron expression for frequency
 * @param {string} frequency - hourly, daily, weekly
 * @returns {string} Cron expression
 */
function getCronExpression(frequency) {
    switch (frequency) {
        case "hourly":
            return "0 * * * *"; // Every hour at minute 0
        case "daily":
            return "0 9 * * *"; // Every day at 9:00
        case "weekly":
            return "0 9 * * 1"; // Every Monday at 9:00
        default:
            return "0 9 * * *"; // Default: daily at 9:00
    }
}

/**
 * Start auto report job for a notification
 * @param {number} notificationId - Notification ID
 * @returns {Promise<void>}
 */
async function startAutoReportJob(notificationId) {
    // Stop existing job if any
    stopAutoReportJob(notificationId);

    const notification = await R.findOne("notification", " id = ? ", [notificationId]);
    if (!notification) return;

    const config = JSON.parse(notification.config || "{}");

    if (!config.telegramEnableAutoReport) return;

    const cronExpression = getCronExpression(config.telegramReportFrequency);

    const job = cron.schedule(cronExpression, async () => {
        await sendAutoReport({ ...notification, config });
    });

    activeReportJobs.set(notificationId, job);
    log.info("telegram-bot", `Auto report job started for notification ${notificationId} with schedule: ${cronExpression}`);
}

/**
 * Stop auto report job for a notification
 * @param {number} notificationId - Notification ID
 */
function stopAutoReportJob(notificationId) {
    const job = activeReportJobs.get(notificationId);
    if (job) {
        job.stop();
        activeReportJobs.delete(notificationId);
        log.info("telegram-bot", `Auto report job stopped for notification ${notificationId}`);
    }
}

/**
 * Initialize all auto report jobs on server start
 * @returns {Promise<void>}
 */
async function initAutoReportJobs() {
    try {
        // Query by config content since notification table doesn't have a type column
        const notifications = await R.find("notification", " config LIKE ? ", ['%"telegramBotToken"%']);

        for (const notification of notifications) {
            const config = JSON.parse(notification.config || "{}");
            if (config.telegramEnableAutoReport) {
                await startAutoReportJob(notification.id);
            }
        }
    } catch (error) {
        log.error("telegram-bot", `Init auto report jobs error: ${error.message}`);
    }
}

// Initialize auto report jobs and polling when this module is loaded
setTimeout(async () => {
    await initAutoReportJobs();
    await initPolling();
}, 5000); // Wait 5 seconds for DB to be ready

/**
 * List all Telegram notifications - for finding the ID
 */
router.get("/list-notifications", async (req, res) => {
    try {
        const notifications = await R.find("notification", " config LIKE ? ", ['%"telegramBotToken"%']);

        let html = "<h2>Notifiche Telegram</h2>";

        if (notifications.length === 0) {
            html += "<p>Nessuna notifica Telegram trovata</p>";
        } else {
            html += "<ul>";
            for (const n of notifications) {
                const config = JSON.parse(n.config || "{}");
                html += `<li>
                    <b>ID: ${n.id}</b> - ${n.name || "Senza nome"}<br>
                    Chat ID: ${config.telegramChatID || "N/A"}<br>
                    <a href="/api/telegram-bot/force-delete-webhook/${n.id}">🗑️ Rimuovi Webhook</a>
                </li><br>`;
            }
            html += "</ul>";
        }

        res.send(html);
    } catch (error) {
        res.send(`Error: ${error.message}`);
    }
});

/**
 * Simple endpoint to remove webhook - can be accessed via browser
 */
router.get("/force-delete-webhook/:notificationId", async (req, res) => {
    try {
        const notificationId = parseInt(req.params.notificationId);

        const notification = await R.findOne("notification", " id = ? ", [notificationId]);
        if (!notification) {
            return res.send("Notification not found");
        }

        const config = JSON.parse(notification.config || "{}");
        if (!config.telegramBotToken) {
            return res.send("Not a Telegram notification");
        }

        // Delete webhook
        const deleteUrl = `https://api.telegram.org/bot${config.telegramBotToken}/deleteWebhook`;
        const deleteResponse = await axios.post(deleteUrl, { drop_pending_updates: true });

        // Get webhook info
        const infoUrl = `https://api.telegram.org/bot${config.telegramBotToken}/getWebhookInfo`;
        const infoResponse = await axios.get(infoUrl);

        res.send(`
            <h2>Webhook Deletion Result</h2>
            <p><b>Delete Response:</b> ${JSON.stringify(deleteResponse.data)}</p>
            <p><b>Current Webhook Info:</b> ${JSON.stringify(infoResponse.data)}</p>
            <p><b>Webhook URL:</b> ${infoResponse.data.result?.url || "NONE (good!)"}</p>
            <br>
            <p>Se "Webhook URL" è "NONE", riavvia il server Uptime Kuma.</p>
            <p><a href="/api/telegram-bot/force-delete-webhook/${notificationId}">Riprova</a></p>
        `);
    } catch (error) {
        res.send(`Error: ${error.message}`);
    }
});

/**
 * Endpoint to start polling for a notification
 */
router.post("/start-polling/:notificationId", async (req, res) => {
    try {
        const notificationId = parseInt(req.params.notificationId);

        const notification = await R.findOne("notification", " id = ? ", [notificationId]);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");

        if (!config.telegramBotToken) {
            return res.status(400).json({ error: "Not a Telegram notification" });
        }

        // Update config to enable bot commands
        config.telegramEnableBotCommands = true;
        notification.config = JSON.stringify(config);
        await R.store(notification);

        // Start polling
        await startPolling(notificationId);

        res.json({
            ok: true,
            message: "Polling avviato con successo!",
            status: "active"
        });
    } catch (error) {
        log.error("telegram-bot", `Start polling error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to stop polling for a notification
 */
router.post("/stop-polling/:notificationId", async (req, res) => {
    try {
        const notificationId = parseInt(req.params.notificationId);

        const notification = await R.findOne("notification", " id = ? ", [notificationId]);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");

        // Update config to disable bot commands
        config.telegramEnableBotCommands = false;
        notification.config = JSON.stringify(config);
        await R.store(notification);

        // Stop polling
        stopPolling(notificationId);

        res.json({
            ok: true,
            message: "Polling fermato con successo!",
            status: "inactive"
        });
    } catch (error) {
        log.error("telegram-bot", `Stop polling error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to get polling status
 */
router.get("/polling-status/:notificationId", async (req, res) => {
    try {
        const notificationId = parseInt(req.params.notificationId);
        const isActive = activePollingJobs.has(notificationId);

        res.json({
            ok: true,
            status: isActive ? "active" : "inactive"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to toggle auto report
 */
router.post("/toggle-auto-report/:notificationId", async (req, res) => {
    try {
        const notificationId = req.params.notificationId;
        const { enabled, frequency } = req.body;

        const notification = await R.findOne("notification", " id = ? ", [notificationId]);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");
        config.telegramEnableAutoReport = enabled;
        config.telegramReportFrequency = frequency || "daily";

        notification.config = JSON.stringify(config);
        await R.store(notification);

        if (enabled) {
            await startAutoReportJob(notificationId);
        } else {
            stopAutoReportJob(notificationId);
        }

        res.json({ ok: true });
    } catch (error) {
        log.error("telegram-bot", `Toggle auto report error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint to send test report
 */
router.post("/test-report/:notificationId", async (req, res) => {
    try {
        const notificationId = req.params.notificationId;

        const notification = await R.findOne("notification", " id = ? ", [notificationId]);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        const config = JSON.parse(notification.config || "{}");
        await sendAutoReport({ ...notification, config });

        res.json({ ok: true });
    } catch (error) {
        log.error("telegram-bot", `Test report error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
