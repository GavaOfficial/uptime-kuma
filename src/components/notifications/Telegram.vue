<template>
    <div class="mb-3">
        <label for="telegram-bot-token" class="form-label">{{ $t("Bot Token") }}</label>
        <HiddenInput id="telegram-bot-token" v-model="$parent.notification.telegramBotToken" :required="true" autocomplete="new-password"></HiddenInput>
        <i18n-t tag="div" keypath="wayToGetTelegramToken" class="form-text">
            <a href="https://t.me/BotFather" target="_blank">https://t.me/BotFather</a>
        </i18n-t>
    </div>

    <div class="mb-3">
        <label for="telegram-chat-id" class="form-label">{{ $t("Chat ID") }}</label>

        <div class="input-group mb-3">
            <input id="telegram-chat-id" v-model="$parent.notification.telegramChatID" type="text" class="form-control" required>
            <button v-if="$parent.notification.telegramBotToken" class="btn btn-outline-secondary" type="button" @click="autoGetTelegramChatID">
                {{ $t("Auto Get") }}
            </button>
        </div>

        <div class="form-text">
            {{ $t("supportTelegramChatID") }}

            <p style="margin-top: 8px;">
                {{ $t("wayToGetTelegramChatID") }}
            </p>

            <p style="margin-top: 8px;">
                <a :href="telegramGetUpdatesURL('withToken')" target="_blank" style="word-break: break-word;">{{ telegramGetUpdatesURL("masked") }}</a>
            </p>
        </div>

        <label for="message_thread_id" class="form-label">{{ $t("telegramMessageThreadID") }}</label>
        <input id="message_thread_id" v-model="$parent.notification.telegramMessageThreadID" type="text" class="form-control">
        <p class="form-text">{{ $t("telegramMessageThreadIDDescription") }}</p>

        <label for="server_url" class="form-label">{{ $t("telegramServerUrl") }}</label>
        <input id="server_url" v-model="$parent.notification.telegramServerUrl" type="text" class="form-control">
        <div class="form-text">
            <i18n-t keypath="telegramServerUrlDescription">
                <a
                    href="https://core.telegram.org/bots/api#using-a-local-bot-api-server"
                    target="_blank"
                >{{ $t("here") }}</a>
                <a
                    href="https://api.telegram.org"
                    target="_blank"
                >https://api.telegram.org</a>
            </i18n-t>
        </div>
    </div>

    <div class="mb-3">
        <div class="form-check form-switch">
            <input v-model="$parent.notification.telegramUseTemplate" class="form-check-input" type="checkbox">
            <label class="form-check-label">{{ $t("telegramUseTemplate") }}</label>
        </div>

        <div class="form-text">
            {{ $t("telegramUseTemplateDescription") }}
        </div>
    </div>

    <template v-if="$parent.notification.telegramUseTemplate">
        <div class="mb-3">
            <label class="form-label" for="message_parse_mode">{{ $t("Message Format") }}</label>
            <select
                id="message_parse_mode"
                v-model="$parent.notification.telegramTemplateParseMode"
                class="form-select"
                required
            >
                <option value="plain">{{ $t("Plain Text") }}</option>
                <option value="HTML">HTML</option>
                <option value="MarkdownV2">MarkdownV2</option>
            </select>
            <i18n-t tag="p" keypath="telegramTemplateFormatDescription" class="form-text">
                <a href="https://core.telegram.org/bots/api#formatting-options" target="_blank">{{ $t("documentation") }}</a>
            </i18n-t>

            <label class="form-label" for="message_template">{{ $t('Message Template') }}</label>
            <TemplatedTextarea id="message_template" v-model="$parent.notification.telegramTemplate" :required="true" :placeholder="telegramTemplatedTextareaPlaceholder"></TemplatedTextarea>
        </div>
    </template>

    <div class="mb-3">
        <div class="form-check form-switch">
            <input v-model="$parent.notification.telegramSendSilently" class="form-check-input" type="checkbox">
            <label class="form-check-label">{{ $t("telegramSendSilently") }}</label>
        </div>

        <div class="form-text">
            {{ $t("telegramSendSilentlyDescription") }}
        </div>
    </div>

    <div class="mb-3">
        <div class="form-check form-switch">
            <input v-model="$parent.notification.telegramProtectContent" class="form-check-input" type="checkbox">
            <label class="form-check-label">{{ $t("telegramProtectContent") }}</label>
        </div>

        <div class="form-text">
            {{ $t("telegramProtectContentDescription") }}
        </div>
    </div>

    <!-- Bot Commands Section -->
    <div class="mb-3 mt-4">
        <h6>{{ $t("telegramBotCommands") }}</h6>
        <div class="form-text mb-2">
            {{ $t("telegramBotCommandsDescription") }}
            <br>
            <b>{{ $t("telegramBotCommandsList") }}</b>
        </div>

        <div class="form-check form-switch mb-2">
            <input v-model="$parent.notification.telegramEnableBotCommands" class="form-check-input" type="checkbox">
            <label class="form-check-label">{{ $t("telegramEnableBotCommands") }}</label>
        </div>

        <!-- Bot Status and Controls - Always show when enabled -->
        <div v-if="$parent.notification.telegramEnableBotCommands" class="mt-2">
            <!-- If notification not saved yet -->
            <div v-if="!notificationId" class="form-text text-warning">
                <font-awesome-icon icon="info-circle" class="me-1" />
                {{ $t("telegramSaveToStart") }}
            </div>

            <!-- If notification is saved, show controls -->
            <div v-else>
                <!-- Loading state -->
                <div v-if="botStatus === 'loading'" class="d-flex align-items-center">
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    <span>{{ $t("loading") }}...</span>
                </div>

                <!-- Loaded state -->
                <div v-else class="d-flex align-items-center flex-wrap gap-2">
                    <span class="badge rounded-pill" :class="botStatus === 'active' ? 'bg-primary' : 'bg-danger'">
                        {{ botStatus === 'active' ? $t("Up") : $t("Down") }}
                    </span>
                    <span class="me-auto">
                        {{ botStatus === 'active' ? $t("telegramBotRunning") : $t("telegramBotStopped") }}
                    </span>
                    <span v-if="botStatusLoading" class="spinner-border spinner-border-sm"></span>
                    <button
                        v-if="botStatus !== 'active'"
                        class="btn btn-primary btn-sm"
                        type="button"
                        :disabled="botStatusLoading"
                        @click="startBot"
                    >
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("Resume") }}
                    </button>
                    <button
                        v-if="botStatus === 'active'"
                        class="btn btn-secondary btn-sm"
                        type="button"
                        :disabled="botStatusLoading"
                        @click="stopBot"
                    >
                        <font-awesome-icon icon="pause" class="me-1" />
                        {{ $t("Pause") }}
                    </button>
                    <button
                        v-if="botStatus === 'active'"
                        class="btn btn-primary btn-sm"
                        type="button"
                        :disabled="botStatusLoading"
                        @click="restartBot"
                    >
                        <font-awesome-icon icon="redo" class="me-1" />
                        {{ $t("telegramRestartBot") }}
                    </button>
                </div>
                <div class="form-text">
                    {{ $t("telegramBotAutoStart") }}
                </div>
            </div>
        </div>
    </div>

    <!-- Auto Report Section -->
    <div v-if="$parent.notification.telegramEnableBotCommands" class="mb-3">
        <h6>{{ $t("telegramAutoReports") }}</h6>
        <div class="form-check form-switch mb-2">
            <input v-model="$parent.notification.telegramEnableAutoReport" class="form-check-input" type="checkbox">
            <label class="form-check-label">{{ $t("telegramEnableAutoReport") }}</label>
        </div>

        <template v-if="$parent.notification.telegramEnableAutoReport">
            <label class="form-label">{{ $t("telegramReportFrequencyLabel") }}</label>
            <select v-model="$parent.notification.telegramReportFrequency" class="form-select">
                <option value="hourly">{{ $t("telegramReportHourly") }}</option>
                <option value="daily">{{ $t("telegramReportDaily") }}</option>
                <option value="weekly">{{ $t("telegramReportWeekly") }}</option>
            </select>
        </template>
    </div>
</template>

<script>
import HiddenInput from "../HiddenInput.vue";
import TemplatedTextarea from "../TemplatedTextarea.vue";
import axios from "axios";

export default {
    components: {
        HiddenInput,
        TemplatedTextarea,
    },
    data() {
        return {
            botStatus: "loading",
            botStatusLoading: false,
            statusCheckInterval: null,
        };
    },
    computed: {
        notificationId() {
            return this.$parent.id;
        },
        telegramTemplatedTextareaPlaceholder() {
            return this.$t("Example:", [
                `
Uptime Kuma Alert{% if monitorJSON %} - {{ monitorJSON['name'] }}{% endif %}

{{ msg }}
                `,
            ]);
        }
    },
    watch: {
        notificationId: {
            immediate: true,
            handler(newId) {
                if (newId) {
                    this.checkBotStatus();
                    // Start periodic status check when ID becomes available
                    this.startStatusCheck();
                }
            }
        },
        "$parent.notification.telegramEnableBotCommands": {
            handler(newVal) {
                if (this.notificationId) {
                    // When the checkbox changes, update bot status
                    setTimeout(() => this.checkBotStatus(), 500);
                }
            }
        }
    },
    mounted() {
        this.$parent.notification.telegramServerUrl ||= "https://api.telegram.org";
        this.$parent.notification.telegramReportFrequency ||= "daily";

        // Check bot status if notification already exists
        if (this.notificationId) {
            this.checkBotStatus();
            this.startStatusCheck();
        }
    },
    beforeUnmount() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
    },
    methods: {
        /**
         * Start periodic status check
         */
        startStatusCheck() {
            // Clear existing interval if any
            if (this.statusCheckInterval) {
                clearInterval(this.statusCheckInterval);
            }
            // Set up periodic status check every 5 seconds
            this.statusCheckInterval = setInterval(() => {
                if (this.notificationId && this.$parent.notification.telegramEnableBotCommands) {
                    this.checkBotStatus();
                }
            }, 5000);
        },

        /**
         * Check the current bot polling status
         * @returns {Promise<void>}
         */
        checkBotStatus() {
            if (!this.notificationId) return;

            this.$root.getSocket().emit("getTelegramBotStatus", this.notificationId, (res) => {
                if (res.ok) {
                    this.botStatus = res.status;
                } else {
                    this.botStatus = "inactive";
                }
            });
        },

        /**
         * Start the bot polling
         * @returns {Promise<void>}
         */
        startBot() {
            if (!this.notificationId) return;

            this.botStatusLoading = true;
            this.$root.getSocket().emit("startTelegramBot", this.notificationId, (res) => {
                this.botStatusLoading = false;
                if (res.ok) {
                    this.$root.toastSuccess(this.$t("telegramBotStarted"));
                    this.botStatus = "active";
                } else {
                    this.$root.toastError(res.msg || "Error starting bot");
                }
            });
        },

        /**
         * Stop the bot polling
         * @returns {Promise<void>}
         */
        stopBot() {
            if (!this.notificationId) return;

            this.botStatusLoading = true;
            this.$root.getSocket().emit("stopTelegramBot", this.notificationId, (res) => {
                this.botStatusLoading = false;
                if (res.ok) {
                    this.$root.toastSuccess(this.$t("telegramBotStopped"));
                    this.botStatus = "inactive";
                } else {
                    this.$root.toastError(res.msg || "Error stopping bot");
                }
            });
        },

        /**
         * Restart the bot (stop then start)
         * @returns {Promise<void>}
         */
        restartBot() {
            if (!this.notificationId) return;

            this.botStatusLoading = true;
            this.$root.getSocket().emit("restartTelegramBot", this.notificationId, (res) => {
                this.botStatusLoading = false;
                if (res.ok) {
                    this.$root.toastSuccess(this.$t("telegramBotRestarted"));
                    this.botStatus = "active";
                } else {
                    this.$root.toastError(res.msg || "Error restarting bot");
                }
            });
        },

        /**
         * Get the URL for telegram updates
         * @param {string} mode Should the token be masked?
         * @returns {string} formatted URL
         */
        telegramGetUpdatesURL(mode = "masked") {
            let token = `<${this.$t("YOUR BOT TOKEN HERE")}>`;

            if (this.$parent.notification.telegramBotToken) {
                if (mode === "withToken") {
                    token = this.$parent.notification.telegramBotToken;
                } else if (mode === "masked") {
                    token = "*".repeat(this.$parent.notification.telegramBotToken.length);
                }
            }

            return `${this.$parent.notification.telegramServerUrl}/bot${token}/getUpdates`;
        },

        /**
         * Get the telegram chat ID
         * @returns {Promise<void>}
         * @throws The chat ID could not be found
         */
        async autoGetTelegramChatID() {
            try {
                let res = await axios.get(this.telegramGetUpdatesURL("withToken"));

                if (res.data.result.length >= 1) {
                    let update = res.data.result[res.data.result.length - 1];

                    if (update.channel_post) {
                        this.$parent.notification.telegramChatID = update.channel_post.chat.id;
                    } else if (update.message) {
                        this.$parent.notification.telegramChatID = update.message.chat.id;
                    } else {
                        throw new Error(this.$t("chatIDNotFound"));
                    }

                } else {
                    throw new Error(this.$t("chatIDNotFound"));
                }

            } catch (error) {
                this.$root.toastError(error.message);
            }

        },
    }
};
</script>

