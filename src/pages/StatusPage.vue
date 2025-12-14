<template>
    <!-- Top Left: Logo -->
    <div class="top-left-header">
        <span class="logo-wrapper" @click="showImageCropUploadMethod">
            <img :src="logoURL" alt class="logo me-2" :class="logoClass" />
        </span>
    </div>

    <!-- Top Right: Overall Status -->
    <div class="top-right-status" :class="{ 'status-ok': allUp, 'status-warning': partialDown, 'status-danger': allDown, 'status-maintenance': isMaintenance, 'has-maintenance-details': isMaintenance && maintenanceList.length > 0 }">
        <template v-if="Object.keys($root.publicMonitorList).length === 0 && loadedData">
            <font-awesome-icon icon="question-circle" />
            <span>{{ $t("No Services") }}</span>
        </template>
        <template v-else-if="allUp">
            <font-awesome-icon icon="check-circle" />
            <span>{{ $t("All Systems Operational") }}</span>
        </template>
        <template v-else-if="partialDown">
            <font-awesome-icon icon="exclamation-circle" />
            <span>{{ $t("Partially Degraded Service") }}</span>
        </template>
        <template v-else-if="allDown">
            <font-awesome-icon icon="times-circle" />
            <span>{{ $t("Degraded Service") }}</span>
        </template>
        <template v-else-if="isMaintenance">
            <font-awesome-icon icon="wrench" />
            <span>{{ $t("maintenanceStatus-under-maintenance") }}</span>
            <!-- Maintenance details shown on hover -->
            <div class="maintenance-details">
                <div v-for="maintenance in maintenanceList" :key="'detail-' + maintenance.id" class="maintenance-item">
                    <strong>{{ maintenance.title }}</strong>
                    <!-- eslint-disable-next-line vue/no-v-html-->
                    <div class="maintenance-description" v-html="maintenanceHTML(maintenance.description)"></div>
                </div>
            </div>
        </template>
    </div>

    <!-- Background with dot pattern and animated eyes visible through dots -->
    <div class="animated-background">
        <!-- Layer 1: Base gray dots (always visible) -->
        <div class="dot-grid-base"></div>

        <!-- Visible Orbit Path (for testing) -->
        <div class="orbit-path"></div>

        <!-- Layer 2: Eyes and colored glows masked through dots -->
        <div class="dot-mask-layer">
            <!-- Bottom Right: Title with mask effect -->
            <div class="masked-title">{{ config.title }}</div>

            <div class="eyes-container" :class="{ 'eyes-alert': hasDownMonitor, 'eyes-maintenance': isMaintenance }">
                <div class="eye">
                    <div class="eyeball" :style="eyeLookStyle">
                        <div class="pupil"></div>
                    </div>
                </div>
                <div class="eye">
                    <div class="eyeball" :style="eyeLookStyle">
                        <div class="pupil"></div>
                    </div>
                </div>
            </div>

            <!-- Colored glows that follow card positions -->
            <div class="orbital-glows" :class="{ 'paused': isHoveringCard }">
                <template v-for="(group, groupIndex) in $root.publicGroupList" :key="'glow-group-' + groupIndex">
                    <div
                        v-for="(monitor, monitorIndex) in group.monitorList"
                        :key="'glow-' + monitor.id"
                        class="card-glow"
                        :class="{
                            'glow-up': getMonitorStatus(monitor.id) === 1,
                            'glow-down': getMonitorStatus(monitor.id) === 0,
                            'glow-maintenance': getMonitorStatus(monitor.id) === 3
                        }"
                        :style="{ animationDelay: getGlowDelay(groupIndex, monitorIndex) }"
                    ></div>
                </template>
            </div>
        </div>
    </div>

    <div v-if="loadedTheme" class="container mt-3 status-page-content">
        <!-- Sidebar for edit mode -->
        <div v-if="enableEditMode" class="sidebar" data-testid="edit-sidebar">
            <div class="sidebar-body">
                <div class="my-3">
                    <label for="slug" class="form-label">{{ $t("Slug") }}</label>
                    <div class="input-group">
                        <span id="basic-addon3" class="input-group-text">/status/</span>
                        <input id="slug" v-model="config.slug" type="text" class="form-control">
                    </div>
                </div>

                <div class="my-3">
                    <label for="title" class="form-label">{{ $t("Title") }}</label>
                    <input id="title" v-model="config.title" type="text" class="form-control">
                </div>

                <!-- Description -->
                <div class="my-3">
                    <label for="description" class="form-label">{{ $t("Description") }}</label>
                    <textarea id="description" v-model="config.description" class="form-control" data-testid="description-input"></textarea>
                    <div class="form-text">
                        {{ $t("markdownSupported") }}
                    </div>
                </div>

                <!-- Footer Text -->
                <div class="my-3">
                    <label for="footer-text" class="form-label">{{ $t("Footer Text") }}</label>
                    <textarea id="footer-text" v-model="config.footerText" class="form-control" data-testid="footer-text-input"></textarea>
                    <div class="form-text">
                        {{ $t("markdownSupported") }}
                    </div>
                </div>

                <div class="my-3">
                    <label for="auto-refresh-interval" class="form-label">{{ $t("Refresh Interval") }}</label>
                    <input id="auto-refresh-interval" v-model="config.autoRefreshInterval" type="number" class="form-control" :min="5" data-testid="refresh-interval-input">
                    <div class="form-text">
                        {{ $t("Refresh Interval Description", [config.autoRefreshInterval]) }}
                    </div>
                </div>

                <div class="my-3">
                    <label for="switch-theme" class="form-label">{{ $t("Theme") }}</label>
                    <select id="switch-theme" v-model="config.theme" class="form-select" data-testid="theme-select">
                        <option value="auto">{{ $t("Auto") }}</option>
                        <option value="light">{{ $t("Light") }}</option>
                        <option value="dark">{{ $t("Dark") }}</option>
                    </select>
                </div>

                <div class="my-3 form-check form-switch">
                    <input id="showTags" v-model="config.showTags" class="form-check-input" type="checkbox" data-testid="show-tags-checkbox">
                    <label class="form-check-label" for="showTags">{{ $t("Show Tags") }}</label>
                </div>

                <!-- Show Powered By -->
                <div class="my-3 form-check form-switch">
                    <input id="show-powered-by" v-model="config.showPoweredBy" class="form-check-input" type="checkbox" data-testid="show-powered-by-checkbox">
                    <label class="form-check-label" for="show-powered-by">{{ $t("Show Powered By") }}</label>
                </div>

                <!-- Show certificate expiry -->
                <div class="my-3 form-check form-switch">
                    <input id="show-certificate-expiry" v-model="config.showCertificateExpiry" class="form-check-input" type="checkbox" data-testid="show-certificate-expiry-checkbox">
                    <label class="form-check-label" for="show-certificate-expiry">{{ $t("showCertificateExpiry") }}</label>
                </div>

                <!-- Show only last heartbeat -->
                <div class="my-3 form-check form-switch">
                    <input id="show-only-last-heartbeat" v-model="config.showOnlyLastHeartbeat" class="form-check-input" type="checkbox">
                    <label class="form-check-label" for="show-only-last-heartbeat">{{ $t("showOnlyLastHeartbeat") }}</label>
                </div>

                <div v-if="false" class="my-3">
                    <label for="password" class="form-label">{{ $t("Password") }} <sup>{{ $t("Coming Soon") }}</sup></label>
                    <input id="password" v-model="config.password" disabled type="password" autocomplete="new-password" class="form-control">
                </div>

                <!-- Domain Name List -->
                <div class="my-3">
                    <label class="form-label">
                        {{ $t("Domain Names") }}
                        <button class="p-0 bg-transparent border-0" :aria-label="$t('Add a domain')" @click="addDomainField">
                            <font-awesome-icon icon="plus-circle" class="action text-primary" />
                        </button>
                    </label>

                    <ul class="list-group domain-name-list">
                        <li v-for="(domain, index) in config.domainNameList" :key="index" class="list-group-item">
                            <input v-model="config.domainNameList[index]" type="text" class="no-bg domain-input" placeholder="example.com" />
                            <button class="p-0 bg-transparent border-0" :aria-label="$t('Remove domain', [ domain ])" @click="removeDomain(index)">
                                <font-awesome-icon icon="times" class="action remove ms-2 me-3 text-danger" />
                            </button>
                        </li>
                    </ul>
                </div>

                <!-- Google Analytics -->
                <div class="my-3">
                    <label for="googleAnalyticsTag" class="form-label">{{ $t("Google Analytics ID") }}</label>
                    <input id="googleAnalyticsTag" v-model="config.googleAnalyticsId" type="text" class="form-control" data-testid="google-analytics-input">
                </div>

                <!-- Custom CSS -->
                <div class="my-3">
                    <div class="mb-1">{{ $t("Custom CSS") }}</div>
                    <prism-editor v-model="config.customCSS" class="css-editor" data-testid="custom-css-input" :highlight="highlighter" line-numbers></prism-editor>
                </div>

                <div class="danger-zone">
                    <button class="btn btn-danger me-2" @click="deleteDialog">
                        <font-awesome-icon icon="trash" />
                        {{ $t("Delete") }}
                    </button>
                </div>
            </div>

            <!-- Sidebar Footer -->
            <div class="sidebar-footer">
                <button class="btn btn-success me-2" :disabled="loading" data-testid="save-button" @click="save">
                    <font-awesome-icon icon="save" />
                    {{ $t("Save") }}
                </button>

                <button class="btn btn-danger me-2" @click="discard">
                    <font-awesome-icon icon="undo" />
                    {{ $t("Discard") }}
                </button>
            </div>
        </div>

        <!-- Main Status Page -->
        <div :class="{ edit: enableEditMode}" class="main">
            <!-- Logo & Title -->
            <h1 class="mb-4 title-flex">
                <!-- Logo -->
                <span class="logo-wrapper" @click="showImageCropUploadMethod">
                    <img :src="logoURL" alt class="logo me-2" :class="logoClass" />
                    <font-awesome-icon v-if="enableEditMode" class="icon-upload" icon="upload" />
                </span>

                <!-- Uploader -->
                <!--    url="/api/status-page/upload-logo" -->
                <ImageCropUpload
                    v-model="showImageCropUpload"
                    field="img"
                    :width="128"
                    :height="128"
                    :langType="$i18n.locale"
                    img-format="png"
                    :noCircle="true"
                    :noSquare="false"
                    @crop-success="cropSuccess"
                />

                <!-- Title -->
                <Editable v-model="config.title" tag="span" :contenteditable="editMode" :noNL="true" />
            </h1>

            <!-- Admin functions -->
            <div v-if="hasToken" class="mb-2">
                <div v-if="!enableEditMode">
                    <button class="btn btn-primary mb-2 me-2" data-testid="edit-button" @click="edit">
                        <font-awesome-icon icon="edit" />
                        {{ $t("Edit Status Page") }}
                    </button>

                    <a href="/manage-status-page" class="btn btn-primary mb-2">
                        <font-awesome-icon icon="tachometer-alt" />
                        {{ $t("Go to Dashboard") }}
                    </a>
                </div>

                <div v-else>
                    <button class="btn btn-primary btn-add-group me-2" data-testid="create-incident-button" @click="createIncident">
                        <font-awesome-icon icon="bullhorn" />
                        {{ $t("Create Incident") }}
                    </button>
                </div>
            </div>

            <!-- Incident -->
            <div v-if="incident !== null" class="shadow-box alert mb-4 p-4 incident" role="alert" :class="incidentClass" data-testid="incident">
                <strong v-if="editIncidentMode">{{ $t("Title") }}:</strong>
                <Editable v-model="incident.title" tag="h4" :contenteditable="editIncidentMode" :noNL="true" class="alert-heading" data-testid="incident-title" />

                <strong v-if="editIncidentMode">{{ $t("Content") }}:</strong>
                <Editable v-if="editIncidentMode" v-model="incident.content" tag="div" :contenteditable="editIncidentMode" class="content" data-testid="incident-content-editable" />
                <div v-if="editIncidentMode" class="form-text">
                    {{ $t("markdownSupported") }}
                </div>
                <!-- eslint-disable-next-line vue/no-v-html-->
                <div v-if="! editIncidentMode" class="content" data-testid="incident-content" v-html="incidentHTML"></div>

                <!-- Incident Date -->
                <div class="date mt-3">
                    {{ $t("Date Created") }}: {{ $root.datetime(incident.createdDate) }} ({{ dateFromNow(incident.createdDate) }})<br />
                    <span v-if="incident.lastUpdatedDate">
                        {{ $t("Last Updated") }}: {{ $root.datetime(incident.lastUpdatedDate) }} ({{ dateFromNow(incident.lastUpdatedDate) }})
                    </span>
                </div>

                <div v-if="editMode" class="mt-3">
                    <button v-if="editIncidentMode" class="btn btn-light me-2" data-testid="post-incident-button" @click="postIncident">
                        <font-awesome-icon icon="bullhorn" />
                        {{ $t("Post") }}
                    </button>

                    <button v-if="!editIncidentMode && incident.id" class="btn btn-light me-2" @click="editIncident">
                        <font-awesome-icon icon="edit" />
                        {{ $t("Edit") }}
                    </button>

                    <button v-if="editIncidentMode" class="btn btn-light me-2" @click="cancelIncident">
                        <font-awesome-icon icon="times" />
                        {{ $t("Cancel") }}
                    </button>

                    <div v-if="editIncidentMode" class="dropdown d-inline-block me-2">
                        <button id="dropdownMenuButton1" class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            {{ $t("Style") }}: {{ $t(incident.style) }}
                        </button>
                        <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton1">
                            <li><a class="dropdown-item" href="#" @click="incident.style = 'info'">{{ $t("info") }}</a></li>
                            <li><a class="dropdown-item" href="#" @click="incident.style = 'warning'">{{ $t("warning") }}</a></li>
                            <li><a class="dropdown-item" href="#" @click="incident.style = 'danger'">{{ $t("danger") }}</a></li>
                            <li><a class="dropdown-item" href="#" @click="incident.style = 'primary'">{{ $t("primary") }}</a></li>
                            <li><a class="dropdown-item" href="#" @click="incident.style = 'light'">{{ $t("light") }}</a></li>
                            <li><a class="dropdown-item" href="#" @click="incident.style = 'dark'">{{ $t("dark") }}</a></li>
                        </ul>
                    </div>

                    <button v-if="!editIncidentMode && incident.id" class="btn btn-light me-2" @click="unpinIncident">
                        <font-awesome-icon icon="unlink" />
                        {{ $t("Delete") }}
                    </button>
                </div>
            </div>

            <!-- Overall Status -->
            <div class="shadow-box list  p-4 overall-status mb-4">
                <div v-if="Object.keys($root.publicMonitorList).length === 0 && loadedData">
                    <font-awesome-icon icon="question-circle" class="ok" />
                    {{ $t("No Services") }}
                </div>

                <template v-else>
                    <div v-if="allUp">
                        <font-awesome-icon icon="check-circle" class="ok" />
                        {{ $t("All Systems Operational") }}
                    </div>

                    <div v-else-if="partialDown">
                        <font-awesome-icon icon="exclamation-circle" class="warning" />
                        {{ $t("Partially Degraded Service") }}
                    </div>

                    <div v-else-if="allDown">
                        <font-awesome-icon icon="times-circle" class="danger" />
                        {{ $t("Degraded Service") }}
                    </div>

                    <div v-else-if="isMaintenance">
                        <font-awesome-icon icon="wrench" class="status-maintenance" />
                        {{ $t("maintenanceStatus-under-maintenance") }}
                    </div>

                    <div v-else>
                        <font-awesome-icon icon="question-circle" style="color: #efefef;" />
                    </div>
                </template>
            </div>

            <!-- Maintenance - Hidden, shown in top-right status on hover -->
            <template v-if="maintenanceList.length > 0">
                <div
                    v-for="maintenance in maintenanceList" :key="maintenance.id"
                    class="shadow-box alert mb-4 p-3 bg-maintenance mt-4 position-relative maintenance-card-hidden" role="alert"
                >
                    <h4 class="alert-heading">{{ maintenance.title }}</h4>
                    <!-- eslint-disable-next-line vue/no-v-html-->
                    <div class="content" v-html="maintenanceHTML(maintenance.description)"></div>
                    <MaintenanceTime :maintenance="maintenance" />
                </div>
            </template>

            <!-- Description -->
            <strong v-if="editMode">{{ $t("Description") }}:</strong>
            <Editable v-if="enableEditMode" v-model="config.description" :contenteditable="editMode" tag="div" class="mb-4 description" data-testid="description-editable" />
            <!-- eslint-disable-next-line vue/no-v-html-->
            <div v-if="! enableEditMode" class="alert-heading p-2" data-testid="description" v-html="descriptionHTML"></div>

            <div v-if="editMode" class="mb-4">
                <div>
                    <button class="btn btn-primary btn-add-group me-2" data-testid="add-group-button" @click="addGroup">
                        <font-awesome-icon icon="plus" />
                        {{ $t("Add Group") }}
                    </button>
                </div>

                <div class="mt-3">
                    <div v-if="sortedMonitorList.length > 0 && loadedData">
                        <label>{{ $t("Add a monitor") }}:</label>
                        <VueMultiselect
                            v-model="selectedMonitor"
                            :options="sortedMonitorList"
                            :multiple="false"
                            :searchable="true"
                            :placeholder="$t('Add a monitor')"
                            label="name"
                            trackBy="name"
                            class="mt-3"
                            data-testid="monitor-select"
                        >
                            <template #option="{ option }">
                                <div class="d-inline-flex">
                                    <span>{{ option.pathName }} <Tag v-for="tag in option.tags" :key="tag" :item="tag" :size="'sm'" /></span>
                                </div>
                            </template>
                        </VueMultiselect>
                    </div>
                    <div v-else class="text-center">
                        {{ $t("No monitors available.") }}  <router-link to="/add">{{ $t("Add one") }}</router-link>
                    </div>
                </div>
            </div>

            <div class="mb-4">
                <div v-if="$root.publicGroupList.length === 0 && loadedData" class="text-center">
                    <!-- 👀 Nothing here, please add a group or a monitor. -->
                    👀 {{ $t("statusPageNothing") }}
                </div>

                <div class="orbital-container" :class="{ 'paused': isHoveringCard }">
                    <PublicGroupList :edit-mode="enableEditMode" :show-tags="config.showTags" :show-certificate-expiry="config.showCertificateExpiry" :show-only-last-heartbeat="config.showOnlyLastHeartbeat" />
                </div>
            </div>

            <footer class="mt-5 mb-4">
                <div class="custom-footer-text text-start">
                    <strong v-if="enableEditMode">{{ $t("Custom Footer") }}:</strong>
                </div>
                <Editable v-if="enableEditMode" v-model="config.footerText" tag="div" :contenteditable="enableEditMode" :noNL="false" class="alert-heading p-2" data-testid="custom-footer-editable" />
                <!-- eslint-disable-next-line vue/no-v-html-->
                <div v-if="! enableEditMode" class="alert-heading p-2" data-testid="footer-text" v-html="footerHTML"></div>

                <p v-if="config.showPoweredBy" data-testid="powered-by">
                    {{ $t("Powered by") }} <a target="_blank" rel="noopener noreferrer" href="https://github.com/louislam/uptime-kuma">{{ $t("Uptime Kuma" ) }}</a>
                </p>
                <p class="custom-ui-credit">
                    Custom UI by <a target="_blank" rel="noopener noreferrer" href="https://github.com/GavaOfficial">GavaOfficial</a> (Unofficial)
                </p>

                <div class="refresh-info mb-2">
                    <div>{{ $t("Last Updated") }}:  {{ lastUpdateTimeDisplay }}</div>
                    <div data-testid="update-countdown-text">{{ $tc("statusPageRefreshIn", [ updateCountdownText]) }}</div>
                </div>
            </footer>
        </div>

        <Confirm ref="confirmDelete" btn-style="btn-danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="deleteStatusPage">
            {{ $t("deleteStatusPageMsg") }}
        </Confirm>

        <component is="style" v-if="config.customCSS" type="text/css">
            {{ config.customCSS }}
        </component>
    </div>
</template>

<script>
import axios from "axios";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Favico from "favico.js";
// import highlighting library (you can use any library you want just return html string)
import { highlight, languages } from "prismjs/components/prism-core";
import "prismjs/components/prism-css";
import "prismjs/themes/prism-tomorrow.css"; // import syntax highlighting styles
import ImageCropUpload from "vue-image-crop-upload";
// import Prism Editor
import { PrismEditor } from "vue-prism-editor";
import "vue-prism-editor/dist/prismeditor.min.css"; // import the styles somewhere
import { useToast } from "vue-toastification";
import { marked } from "marked";
import DOMPurify from "dompurify";
import Confirm from "../components/Confirm.vue";
import PublicGroupList from "../components/PublicGroupList.vue";
import MaintenanceTime from "../components/MaintenanceTime.vue";
import { getResBaseURL } from "../util-frontend";
import { STATUS_PAGE_ALL_DOWN, STATUS_PAGE_ALL_UP, STATUS_PAGE_MAINTENANCE, STATUS_PAGE_PARTIAL_DOWN, UP, MAINTENANCE } from "../util.ts";
import Tag from "../components/Tag.vue";
import VueMultiselect from "vue-multiselect";

const toast = useToast();
dayjs.extend(duration);

const leavePageMsg = "Do you really want to leave? you have unsaved changes!";

// eslint-disable-next-line no-unused-vars
let feedInterval;

const favicon = new Favico({
    animation: "none"
});

export default {

    components: {
        PublicGroupList,
        ImageCropUpload,
        Confirm,
        PrismEditor,
        MaintenanceTime,
        Tag,
        VueMultiselect
    },

    // Leave Page for vue route change
    beforeRouteLeave(to, from, next) {
        if (this.editMode) {
            const answer = window.confirm(leavePageMsg);
            if (answer) {
                next();
            } else {
                next(false);
            }
        }
        next();
    },

    props: {
        /** Override for the status page slug */
        overrideSlug: {
            type: String,
            required: false,
            default: null,
        },
    },

    data() {
        return {
            slug: null,
            enableEditMode: false,
            enableEditIncidentMode: false,
            hasToken: false,
            config: {},
            selectedMonitor: null,
            incident: null,
            previousIncident: null,
            showImageCropUpload: false,
            imgDataUrl: "/icon.svg",
            loadedTheme: false,
            loadedData: false,
            baseURL: "",
            clickedEditButton: false,
            maintenanceList: [],
            lastUpdateTime: dayjs(),
            updateCountdown: null,
            updateCountdownText: null,
            loading: true,
            eyeTrackInterval: null,
            eyeLookX: 0,
            eyeLookY: 0,
            isHoveringCard: false,
        };
    },
    computed: {

        logoURL() {
            if (this.imgDataUrl.startsWith("data:")) {
                return this.imgDataUrl;
            } else {
                return this.baseURL + this.imgDataUrl;
            }
        },

        /**
         * If the monitor is added to public list, which will not be in this list.
         * @returns {object[]} List of monitors
         */
        sortedMonitorList() {
            let result = [];

            for (let id in this.$root.monitorList) {
                if (this.$root.monitorList[id] && ! (id in this.$root.publicMonitorList)) {
                    let monitor = this.$root.monitorList[id];
                    result.push(monitor);
                }
            }

            result.sort((m1, m2) => {

                if (m1.active !== m2.active) {
                    if (m1.active === 0) {
                        return 1;
                    }

                    if (m2.active === 0) {
                        return -1;
                    }
                }

                if (m1.weight !== m2.weight) {
                    if (m1.weight > m2.weight) {
                        return -1;
                    }

                    if (m1.weight < m2.weight) {
                        return 1;
                    }
                }

                return m1.pathName.localeCompare(m2.pathName);
            });

            return result;
        },

        editMode() {
            return this.enableEditMode && this.$root.socket.connected;
        },

        editIncidentMode() {
            return this.enableEditIncidentMode;
        },

        isPublished() {
            return this.config.published;
        },

        logoClass() {
            if (this.editMode) {
                return {
                    "edit-mode": true,
                };
            }
            return {};
        },

        incidentClass() {
            return "bg-" + this.incident.style;
        },

        maintenanceClass() {
            return "bg-maintenance";
        },

        overallStatus() {

            if (Object.keys(this.$root.publicLastHeartbeatList).length === 0) {
                return -1;
            }

            let status = STATUS_PAGE_ALL_UP;
            let hasUp = false;
            let hasMaintenance = false;
            let hasDown = false;

            for (let id in this.$root.publicLastHeartbeatList) {
                let beat = this.$root.publicLastHeartbeatList[id];

                if (beat.status === MAINTENANCE) {
                    hasMaintenance = true;
                } else if (beat.status === UP) {
                    hasUp = true;
                } else {
                    hasDown = true;
                }
            }

            // Priority: All Down > Partial Down > Maintenance > All Up
            if (!hasUp && hasDown) {
                status = STATUS_PAGE_ALL_DOWN;
            } else if (hasDown) {
                status = STATUS_PAGE_PARTIAL_DOWN;
            } else if (hasMaintenance) {
                status = STATUS_PAGE_MAINTENANCE;
            }

            return status;
        },

        allUp() {
            return this.overallStatus === STATUS_PAGE_ALL_UP;
        },

        partialDown() {
            return this.overallStatus === STATUS_PAGE_PARTIAL_DOWN;
        },

        allDown() {
            return this.overallStatus === STATUS_PAGE_ALL_DOWN;
        },

        isMaintenance() {
            return this.overallStatus === STATUS_PAGE_MAINTENANCE;
        },

        incidentHTML() {
            if (this.incident.content != null) {
                return DOMPurify.sanitize(marked(this.incident.content));
            } else {
                return "";
            }
        },

        descriptionHTML() {
            if (this.config.description != null) {
                return DOMPurify.sanitize(marked(this.config.description));
            } else {
                return "";
            }
        },

        footerHTML() {
            if (this.config.footerText != null) {
                return DOMPurify.sanitize(marked(this.config.footerText));
            } else {
                return "";
            }
        },

        lastUpdateTimeDisplay() {
            return this.$root.datetime(this.lastUpdateTime);
        },

        /**
         * Check if any monitor is down
         * @returns {boolean} True if at least one monitor is down
         */
        hasDownMonitor() {
            for (let group of this.$root.publicGroupList) {
                for (let monitor of group.monitorList) {
                    let heartbeats = this.$root.heartbeatList[monitor.id] ?? [];
                    let lastHeartbeat = heartbeats[heartbeats.length - 1];
                    if (lastHeartbeat?.status === 0) {
                        return true;
                    }
                }
            }
            return false;
        },

        /**
         * Get the index of the first down monitor for eye direction
         * @returns {number} Index of first down monitor, -1 if none
         */
        firstDownMonitorIndex() {
            let totalIndex = 0;
            for (let group of this.$root.publicGroupList) {
                for (let monitor of group.monitorList) {
                    let heartbeats = this.$root.heartbeatList[monitor.id] ?? [];
                    let lastHeartbeat = heartbeats[heartbeats.length - 1];
                    if (lastHeartbeat?.status === 0) {
                        return totalIndex;
                    }
                    totalIndex++;
                }
            }
            return -1;
        },

        /**
         * Calculate eye look direction based on down monitor position
         * @returns {object} CSS style object for eyeball transform
         */
        eyeLookStyle() {
            if (!this.hasDownMonitor) {
                return {}; // Default animation
            }

            return {
                animation: 'none',
                transform: `translate(${this.eyeLookX}px, ${this.eyeLookY}px)`
            };
        }
    },
    watch: {

        /**
         * If connected to the socket and logged in, request private data of this statusPage
         * @param {boolean} loggedIn Is the client logged in?
         * @returns {void}
         */
        "$root.loggedIn"(loggedIn) {
            if (loggedIn) {
                this.$root.getSocket().emit("getStatusPage", this.slug, (res) => {
                    if (res.ok) {
                        this.config = res.config;

                        if (!this.config.customCSS) {
                            this.config.customCSS = "body {\n" +
                                "  \n" +
                                "}\n";
                        }

                    } else {
                        this.$root.toastError(res.msg);
                    }
                });
            }
        },

        /**
         * Selected a monitor and add to the list.
         * @param {object} monitor Monitor to add
         * @returns {void}
         */
        selectedMonitor(monitor) {
            if (monitor) {
                if (this.$root.publicGroupList.length === 0) {
                    this.addGroup();
                }

                const firstGroup = this.$root.publicGroupList[0];

                firstGroup.monitorList.push(monitor);
                this.selectedMonitor = null;
            }
        },

        // Set Theme
        "config.theme"() {
            this.$root.statusPageTheme = this.config.theme;
            this.loadedTheme = true;
        },

        "config.title"(title) {
            document.title = title;
        },

        "$root.monitorList"() {
            let count = Object.keys(this.$root.monitorList).length;

            // Since publicGroupList is getting from public rest api, monitors' tags may not present if showTags = false
            if (count > 0) {
                for (let group of this.$root.publicGroupList) {
                    for (let monitor of group.monitorList) {
                        if (monitor.tags === undefined && this.$root.monitorList[monitor.id]) {
                            monitor.tags = this.$root.monitorList[monitor.id].tags;
                        }
                    }
                }
            }
        }

    },
    async created() {
        this.hasToken = ("token" in this.$root.storage());

        // Browser change page
        // https://stackoverflow.com/questions/7317273/warn-user-before-leaving-web-page-with-unsaved-changes
        window.addEventListener("beforeunload", (e) => {
            if (this.editMode) {
                (e || window.event).returnValue = leavePageMsg;
                return leavePageMsg;
            } else {
                return null;
            }
        });

        // Special handle for dev
        this.baseURL = getResBaseURL();
    },
    beforeUnmount() {
        // Clean up eye tracking interval
        if (this.eyeTrackInterval) {
            clearInterval(this.eyeTrackInterval);
        }
    },
    async mounted() {
        this.slug = this.overrideSlug || this.$route.params.slug;

        if (!this.slug) {
            this.slug = "default";
        }

        // Track down card position and update eye direction
        this.eyeTrackInterval = setInterval(() => {
            this.updateEyeDirection();
            this.checkCardHover();
        }, 50);

        this.getData().then((res) => {
            this.config = res.data.config;

            if (!this.config.domainNameList) {
                this.config.domainNameList = [];
            }

            if (this.config.icon) {
                this.imgDataUrl = this.config.icon;
            }

            this.incident = res.data.incident;
            this.maintenanceList = res.data.maintenanceList;
            this.$root.publicGroupList = res.data.publicGroupList;

            this.loading = false;

            // Configure auto-refresh loop
            feedInterval = setInterval(() => {
                this.updateHeartbeatList();
            }, Math.max(5, this.config.autoRefreshInterval) * 1000);

            this.updateUpdateTimer();
        }).catch( function (error) {
            if (error.response.status === 404) {
                location.href = "/page-not-found";
            }
            console.log(error);
        });

        this.updateHeartbeatList();

        // Go to edit page if ?edit present
        // null means ?edit present, but no value
        if (this.$route.query.edit || this.$route.query.edit === null) {
            this.edit();
        }
    },
    methods: {

        /**
         * Get status page data
         * It should be preloaded in window.preloadData
         * @returns {Promise<any>} Status page data
         */
        getData: function () {
            if (window.preloadData) {
                return new Promise(resolve => resolve({
                    data: window.preloadData
                }));
            } else {
                return axios.get("/api/status-page/" + this.slug);
            }
        },

        /**
         * Provide syntax highlighting for CSS
         * @param {string} code Text to highlight
         * @returns {string} Highlighted CSS
         */
        highlighter(code) {
            return highlight(code, languages.css);
        },

        /**
         * Update the heartbeat list and update favicon if necessary
         * @returns {void}
         */
        updateHeartbeatList() {
            // If editMode, it will use the data from websocket.
            if (! this.editMode) {
                axios.get("/api/status-page/heartbeat/" + this.slug).then((res) => {
                    const { heartbeatList, uptimeList } = res.data;

                    this.$root.heartbeatList = heartbeatList;
                    this.$root.uptimeList = uptimeList;

                    const heartbeatIds = Object.keys(heartbeatList);
                    const downMonitors = heartbeatIds.reduce((downMonitorsAmount, currentId) => {
                        const monitorHeartbeats = heartbeatList[currentId];
                        const lastHeartbeat = monitorHeartbeats.at(-1);

                        if (lastHeartbeat) {
                            return lastHeartbeat.status === 0 ? downMonitorsAmount + 1 : downMonitorsAmount;
                        } else {
                            return downMonitorsAmount;
                        }
                    }, 0);

                    favicon.badge(downMonitors);

                    this.loadedData = true;
                    this.lastUpdateTime = dayjs();
                    this.updateUpdateTimer();
                });
            }
        },

        /**
         * Setup timer to display countdown to refresh
         * @returns {void}
         */
        updateUpdateTimer() {
            clearInterval(this.updateCountdown);

            this.updateCountdown = setInterval(() => {
                // rounding here as otherwise we sometimes skip numbers in cases of time drift
                const countdown = dayjs.duration(
                    Math.round(
                        this.lastUpdateTime
                            .add(Math.max(5, this.config.autoRefreshInterval), "seconds")
                            .diff(dayjs())
                        / 1000
                    ), "seconds");

                if (countdown.as("seconds") < 0) {
                    clearInterval(this.updateCountdown);
                } else {
                    this.updateCountdownText = countdown.format("mm:ss");
                }
            }, 1000);
        },

        /**
         * Enable editing mode
         * @returns {void}
         */
        edit() {
            if (this.hasToken) {
                this.$root.initSocketIO(true);
                this.enableEditMode = true;
                this.clickedEditButton = true;

                // Try to fix #1658
                this.loadedData = true;
            }
        },

        /**
         * Save the status page
         * @returns {void}
         */
        save() {
            this.loading = true;
            let startTime = new Date();
            this.config.slug = this.config.slug.trim().toLowerCase();

            this.$root.getSocket().emit("saveStatusPage", this.slug, this.config, this.imgDataUrl, this.$root.publicGroupList, (res) => {
                if (res.ok) {
                    this.enableEditMode = false;
                    this.$root.publicGroupList = res.publicGroupList;

                    // Add some delay, so that the side menu animation would be better
                    let endTime = new Date();
                    let time = 100 - (endTime - startTime) / 1000;

                    if (time < 0) {
                        time = 0;
                    }

                    setTimeout(() => {
                        this.loading = false;
                        location.href = "/status/" + this.config.slug;
                    }, time);

                } else {
                    this.loading = false;
                    toast.error(res.msg);
                }
            });
        },

        /**
         * Show dialog confirming deletion
         * @returns {void}
         */
        deleteDialog() {
            this.$refs.confirmDelete.show();
        },

        /**
         * Request deletion of this status page
         * @returns {void}
         */
        deleteStatusPage() {
            this.$root.getSocket().emit("deleteStatusPage", this.slug, (res) => {
                if (res.ok) {
                    this.enableEditMode = false;
                    location.href = "/manage-status-page";
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },

        /**
         * Returns label for a specified monitor
         * @param {object} monitor Object representing monitor
         * @returns {string} Monitor label
         */
        monitorSelectorLabel(monitor) {
            return `${monitor.name}`;
        },

        /**
         * Add a group to the status page
         * @returns {void}
         */
        addGroup() {
            let groupName = this.$t("Untitled Group");

            if (this.$root.publicGroupList.length === 0) {
                groupName = this.$t("Services");
            }

            this.$root.publicGroupList.unshift({
                name: groupName,
                monitorList: [],
            });
        },

        /**
         * Add a domain to the status page
         * @returns {void}
         */
        addDomainField() {
            this.config.domainNameList.push("");
        },

        /**
         * Discard changes to status page
         * @returns {void}
         */
        discard() {
            location.href = "/status/" + this.slug;
        },

        /**
         * Set URL of new image after successful crop operation
         * @param {string} imgDataUrl URL of image in data:// format
         * @returns {void}
         */
        cropSuccess(imgDataUrl) {
            this.imgDataUrl = imgDataUrl;
        },

        /**
         * Show image crop dialog if in edit mode
         * @returns {void}
         */
        showImageCropUploadMethod() {
            if (this.editMode) {
                this.showImageCropUpload = true;
            }
        },

        /**
         * Create an incident for this status page
         * @returns {void}
         */
        createIncident() {
            this.enableEditIncidentMode = true;

            if (this.incident) {
                this.previousIncident = this.incident;
            }

            this.incident = {
                title: "",
                content: "",
                style: "primary",
            };
        },

        /**
         * Post the incident to the status page
         * @returns {void}
         */
        postIncident() {
            if (this.incident.title === "" || this.incident.content === "") {
                this.$root.toastError("Please input title and content");
                return;
            }

            this.$root.getSocket().emit("postIncident", this.slug, this.incident, (res) => {

                if (res.ok) {
                    this.enableEditIncidentMode = false;
                    this.incident = res.incident;
                } else {
                    this.$root.toastError(res.msg);
                }

            });

        },

        /**
         * Click Edit Button
         * @returns {void}
         */
        editIncident() {
            this.enableEditIncidentMode = true;
            this.previousIncident = Object.assign({}, this.incident);
        },

        /**
         * Cancel creation or editing of incident
         * @returns {void}
         */
        cancelIncident() {
            this.enableEditIncidentMode = false;

            if (this.previousIncident) {
                this.incident = this.previousIncident;
                this.previousIncident = null;
            }
        },

        /**
         * Unpin the incident
         * @returns {void}
         */
        unpinIncident() {
            this.$root.getSocket().emit("unpinIncident", this.slug, () => {
                this.incident = null;
            });
        },

        /**
         * Get the relative time difference of a date from now
         * @param {any} date Date to get time difference
         * @returns {string} Time difference
         */
        dateFromNow(date) {
            return dayjs.utc(date).fromNow();
        },

        /**
         * Remove a domain from the status page
         * @param {number} index Index of domain to remove
         * @returns {void}
         */
        removeDomain(index) {
            this.config.domainNameList.splice(index, 1);
        },

        /**
         * Generate sanitized HTML from maintenance description
         * @param {string} description Text to sanitize
         * @returns {string} Sanitized HTML
         */
        maintenanceHTML(description) {
            if (description) {
                return DOMPurify.sanitize(marked(description));
            } else {
                return "";
            }
        },

        /**
         * Check if any card is being hovered
         * @returns {void}
         */
        checkCardHover() {
            const hoveredCard = document.querySelector(".orbital-container .item:hover");
            this.isHoveringCard = hoveredCard !== null;
        },

        /**
         * Update eye direction based on down card's actual DOM position
         * @returns {void}
         */
        updateEyeDirection() {
            if (!this.hasDownMonitor) {
                this.eyeLookX = 0;
                this.eyeLookY = 0;
                return;
            }

            // Find the down card element
            const downCard = document.querySelector(".item.monitor-down");
            if (!downCard) {
                return;
            }

            // Get card position
            const cardRect = downCard.getBoundingClientRect();
            const cardCenterX = cardRect.left + cardRect.width / 2;
            const cardCenterY = cardRect.top + cardRect.height / 2;

            // Get center of screen (where eyes are)
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            // Calculate direction vector
            const dirX = cardCenterX - centerX;
            const dirY = cardCenterY - centerY;

            // Normalize and scale to eye movement range
            const distance = Math.sqrt(dirX * dirX + dirY * dirY);
            if (distance > 0) {
                this.eyeLookX = (dirX / distance) * 35;
                this.eyeLookY = (dirY / distance) * 20;
            }
        },

        /**
         * Get monitor status from heartbeat list
         * @param {number} monitorId Monitor ID
         * @returns {number|null} Status (1=up, 0=down, null=unknown)
         */
        getMonitorStatus(monitorId) {
            let heartbeats = this.$root.heartbeatList[monitorId] ?? [];
            let lastHeartbeat = heartbeats[heartbeats.length - 1];
            return lastHeartbeat?.status ?? null;
        },

        /**
         * Get animation delay for orbital glow based on monitor index
         * @param {number} groupIndex Group index
         * @param {number} monitorIndex Monitor index within group
         * @returns {string} CSS animation delay
         */
        getGlowDelay(groupIndex, monitorIndex) {
            // Calculate total index across all groups
            let totalIndex = 0;
            for (let i = 0; i < groupIndex; i++) {
                totalIndex += this.$root.publicGroupList[i]?.monitorList?.length || 0;
            }
            totalIndex += monitorIndex;

            // Same delays as the cards (60s animation)
            const delays = [ 0, -30, -15, -45, -7.5, -37.5, -22.5, -52.5 ];
            const delay = delays[totalIndex % delays.length];
            return delay + "s";
        },

    }
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

/* CSS Custom Property for smooth angle animation */
@property --orbit-angle {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
}

/* Top Left Header - Logo & Title */
.top-left-header {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 12px;
}

.top-left-header .logo {
    width: 40px;
    height: 40px;
    border-radius: 8px;
}

/* Bottom Left: Title with mask effect */
.masked-title {
    position: fixed;
    bottom: 30px;
    left: 30px;
    font-size: clamp(60px, 10vw, 150px);
    font-weight: 800;
    color: #ffffff;
    text-align: left;
    line-height: 0.9;
    max-width: 50vw;
    word-wrap: break-word;
    text-transform: uppercase;
    letter-spacing: -0.02em;
}

/* Top Right Status */
.top-right-status {
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    left: auto !important;
    z-index: 200;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    width: auto;
    white-space: nowrap;
}

.top-right-status.status-ok {
    color: #22c55e;
}

.top-right-status.status-warning {
    color: #f59e0b;
}

.top-right-status.status-danger {
    color: #ef4444;
}

.top-right-status.status-maintenance {
    color: #3b82f6;
}

/* Maintenance details - hidden by default, shown on hover */
.top-right-status .maintenance-details {
    display: none;
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 15px 20px;
    min-width: 300px;
    max-width: 400px;
    text-align: left;
    white-space: normal;
}

.top-right-status.has-maintenance-details {
    cursor: pointer;
    position: relative;
}

.top-right-status.has-maintenance-details:hover .maintenance-details {
    display: block;
}

.maintenance-details .maintenance-item {
    margin-bottom: 10px;
}

.maintenance-details .maintenance-item:last-child {
    margin-bottom: 0;
}

.maintenance-details .maintenance-item strong {
    display: block;
    font-size: 14px;
    margin-bottom: 5px;
    color: #3b82f6;
}

.maintenance-details .maintenance-description {
    font-size: 13px;
    color: #ccc;
    line-height: 1.4;
}

/* Hide the big maintenance card in the center */
.maintenance-card-hidden {
    display: none !important;
}

/* Animated Background: Dots visible, colored by shapes behind */
.animated-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background-color: #000000;
    overflow: hidden;
}

/* Base layer: Gray dots (always visible) */
.dot-grid-base {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    background-image: radial-gradient(circle, #3a3a3a 1.5px, transparent 1.5px);
    background-size: 10px 10px;
}

/* Orbit path - transparent */
.orbit-path {
    display: none;
}

/* Dot mask layer - Shows content only through dots */
.dot-mask-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    -webkit-mask-image: radial-gradient(circle, black 1.5px, transparent 1.5px);
    mask-image: radial-gradient(circle, black 1.5px, transparent 1.5px);
    -webkit-mask-size: 10px 10px;
    mask-size: 10px 10px;
    -webkit-mask-repeat: repeat;
    mask-repeat: repeat;
    pointer-events: none;
}

/* Orbital glows container */
.orbital-glows {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0;
    height: 0;
}

/* Individual card glow - follows same orbit as cards */
.card-glow {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 350px;
    height: 200px;
    border-radius: 50%;
    --orbit-x: clamp(200px, 40vw, 600px);
    --orbit-y: clamp(175px, 35vh, 400px);
    animation: orbit-angle-anim 60s linear infinite;
    transform: translate(
        calc(-50% + cos(var(--orbit-angle)) * var(--orbit-x)),
        calc(-50% + sin(var(--orbit-angle)) * var(--orbit-y))
    );
    pointer-events: none;
}

/* Light gray card shape for UP monitors */
.card-glow.glow-up {
    width: clamp(200px, 25vw, 400px);
    height: clamp(80px, 10vw, 130px);
    border-radius: clamp(10px, 1.2vw, 16px);
    background-color: #9ca3af;
}

/* Red card shape for DOWN monitors */
.card-glow.glow-down {
    width: clamp(200px, 25vw, 400px);
    height: clamp(80px, 10vw, 130px);
    border-radius: clamp(10px, 1.2vw, 16px);
    background-color: #ef4444;
}

/* Blue card shape for MAINTENANCE monitors */
.card-glow.glow-maintenance {
    width: clamp(200px, 25vw, 400px);
    height: clamp(80px, 10vw, 130px);
    border-radius: clamp(10px, 1.2vw, 16px);
    background-color: #3b82f6;
}

/* Pause glow animations when hovering cards */
.orbital-glows.paused .card-glow {
    animation-play-state: paused;
}

/* Animated Eyes */
.eyes-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    gap: 60px;
}

.eye {
    width: 200px;
    height: 320px;
    background: #ff8c00;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
        0 0 60px rgba(255, 140, 0, 0.4),
        inset 0 -20px 40px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    transition: background 0.5s ease, box-shadow 0.5s ease;
}

/* Red eyes when server is down */
.eyes-alert .eye {
    background: #ef4444;
    box-shadow:
        0 0 60px rgba(239, 68, 68, 0.6),
        inset 0 -20px 40px rgba(0, 0, 0, 0.2);
}

/* Blue eyes when in maintenance */
.eyes-maintenance .eye {
    background: #3b82f6;
    box-shadow:
        0 0 60px rgba(59, 130, 246, 0.6),
        inset 0 -20px 40px rgba(0, 0, 0, 0.2);
}

.eyeball {
    width: 100px;
    height: 140px;
    background: #1a1a2e;
    border-radius: 50%;
    position: relative;
    animation: look-around 3s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
}

.pupil {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 35px;
    height: 35px;
    background: #fff;
    border-radius: 50%;
    opacity: 0.8;
}

/* Eye looking animation - smooth continuous movement */
@keyframes look-around {
    0% {
        transform: translateX(0);
    }
    25% {
        transform: translateX(-35px);
    }
    50% {
        transform: translateX(0);
    }
    75% {
        transform: translateX(35px);
    }
    100% {
        transform: translateX(0);
    }
}

.status-page-content {
    position: relative;
    z-index: 1;
}

/* Orbital container for cards moving around eyes */
.orbital-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100px;
    height: 100px;
    pointer-events: none;
    z-index: 5;
}

.orbital-container :deep(.shadow-box.monitor-list) {
    background: transparent !important;
    box-shadow: none !important;
    border: none !important;
    min-height: auto !important;
}

.orbital-container :deep(.mb-5) {
    margin-bottom: 0 !important;
}

.orbital-container :deep(.group-title) {
    display: none;
}

.orbital-container :deep(.monitor-list) {
    position: relative;
}

.orbital-container :deep(.item) {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    pointer-events: auto;
    background-color: #1c2333 !important;
    border-radius: clamp(10px, 1.2vw, 16px);
    padding: clamp(12px, 1.5vw, 25px) clamp(15px, 2vw, 30px);
    width: clamp(200px, 25vw, 400px);
    /* Responsive elliptical orbit using viewport units */
    --orbit-x: clamp(200px, 40vw, 600px);
    --orbit-y: clamp(175px, 35vh, 400px);
    animation: orbit-angle-anim 60s linear infinite;
    transform: translate(
        calc(-50% + cos(var(--orbit-angle)) * var(--orbit-x)),
        calc(-50% + sin(var(--orbit-angle)) * var(--orbit-y))
    ) !important;
}

/* Card layout: info on top, heartbeat bar below */
.orbital-container :deep(.item .row) {
    display: flex;
    flex-direction: column !important;
}

.orbital-container :deep(.item .col-6) {
    width: 100% !important;
    max-width: 100% !important;
    flex: none !important;
    padding: 0 !important;
}

/* Info section on top */
.orbital-container :deep(.item .col-6:first-child) {
    margin-bottom: 10px;
}

/* Info section with percentage and name */
.orbital-container :deep(.item .info) {
    display: flex;
    align-items: center;
    gap: 10px;
}

.orbital-container :deep(.item .item-name) {
    color: #fff;
    font-weight: 600;
    font-size: clamp(14px, 1.3vw, 20px);
    margin: 0;
}

.orbital-container :deep(.item .badge) {
    font-size: clamp(11px, 1vw, 15px) !important;
    padding: clamp(4px, 0.5vw, 8px) clamp(6px, 0.8vw, 12px) !important;
}

.orbital-container :deep(.item .small-padding) {
    padding: 0 !important;
}

/* Heartbeat bar container - fit inside card */
.orbital-container :deep(.item .col-6:last-child) {
    width: 100% !important;
    overflow: hidden;
}

.orbital-container :deep(.item .wrap) {
    width: 100% !important;
    overflow: hidden !important;
    padding: 2px 0 !important;
    direction: rtl !important; /* This makes overflow hide from left instead of right */
}

.orbital-container :deep(.item .hp-bar-big) {
    width: fit-content !important;
    max-width: none !important;
    overflow: visible !important;
    direction: ltr !important; /* Reset direction for proper content display */
}

.orbital-container :deep(.item .heartbeat-canvas) {
    display: block !important;
    height: clamp(18px, 2vw, 32px) !important;
}

/* Hide the time labels in orbital cards */
.orbital-container :deep(.item .word) {
    display: none !important;
}

/* Extra info section - hide in orbital cards for cleaner look */
.orbital-container :deep(.item .extra-info) {
    display: none !important;
}

/* Card UP - transparent background, light gray dots visible behind */
.orbital-container :deep(.item.monitor-up) {
    background-color: transparent !important;
}

/* Card DOWN - transparent background, red dots visible behind */
.orbital-container :deep(.item.monitor-down) {
    background-color: transparent !important;
}

/* Card MAINTENANCE - transparent background, blue dots visible behind */
.orbital-container :deep(.item.monitor-maintenance) {
    background-color: transparent !important;
}

/* Pause ALL card animations when hovering any card */
.orbital-container.paused :deep(.item) {
    animation-play-state: paused !important;
}

.orbital-container :deep(.item:hover) {
    z-index: 1000 !important;
}

/* Animate the angle custom property */
@keyframes orbit-angle-anim {
    from { --orbit-angle: 0deg; }
    to { --orbit-angle: 360deg; }
}

/* Distribute cards at maximum distance from each other on orbit */
.orbital-container :deep(.item:nth-child(1)) { animation-delay: 0s; }
.orbital-container :deep(.item:nth-child(2)) { animation-delay: -30s; }
.orbital-container :deep(.item:nth-child(3)) { animation-delay: -15s; }
.orbital-container :deep(.item:nth-child(4)) { animation-delay: -45s; }
.orbital-container :deep(.item:nth-child(5)) { animation-delay: -7.5s; }
.orbital-container :deep(.item:nth-child(6)) { animation-delay: -37.5s; }
.orbital-container :deep(.item:nth-child(7)) { animation-delay: -22.5s; }
.orbital-container :deep(.item:nth-child(8)) { animation-delay: -52.5s; }


.overall-status {
    font-weight: bold;
    font-size: 25px;

    .ok {
        color: $primary;
    }

    .warning {
        color: $warning;
    }

    .danger {
        color: $danger;
    }
}

h1 {
    font-size: 30px;

    img {
        vertical-align: middle;
        height: 60px;
        width: 60px;
    }
}

.main {
    transition: all ease-in-out 0.1s;

    &.edit {
        margin-left: 300px;
    }
}

.sidebar {
    position: fixed;
    left: 0;
    top: 0;
    width: 300px;
    height: 100vh;
    background-color: $dark-header-bg;
    border-right: 1px solid $dark-border-color;

    .danger-zone {
        border-top: 1px solid $dark-border-color;
        padding-top: 15px;
    }

    .sidebar-body {
        padding: 0 10px 10px 10px;
        overflow-x: hidden;
        overflow-y: auto;
        height: calc(100% - 70px);
    }

    .sidebar-footer {
        border-top: 1px solid $dark-border-color;
        border-right: 1px solid $dark-border-color;
        padding: 10px;
        width: 300px;
        height: 70px;
        position: fixed;
        left: 0;
        bottom: 0;
        background-color: $dark-header-bg;
        display: flex;
        align-items: center;
    }
}

footer {
    position: fixed;
    bottom: 20px;
    right: 20px;
    text-align: right;
    font-size: 12px;
    z-index: 200;
    color: #888;
}

.custom-ui-credit {
    font-size: 12px;
    margin-top: 2px;
    color: #888;
}

.custom-ui-credit a {
    color: #888;
}

.description span {
    min-width: 50px;
}

/* Hide original title and status in main content (moved to fixed headers) */
.title-flex {
    display: none;
}

.overall-status {
    display: none;
}

.logo-wrapper {
    display: inline-block;
    position: relative;

    &:hover {
        .icon-upload {
            transform: scale(1.2);
        }
    }

    .icon-upload {
        transition: all $easing-in 0.2s;
        position: absolute;
        bottom: 6px;
        font-size: 20px;
        left: -14px;
        background-color: #1a1a2e;
        color: #fff;
        padding: 5px;
        border-radius: 10px;
        cursor: pointer;
        box-shadow: 0 15px 70px rgba(0, 0, 0, 0.9);
    }
}

.logo {
    transition: all $easing-in 0.2s;

    &.edit-mode {
        cursor: pointer;

        &:hover {
            transform: scale(1.2);
        }
    }
}

.incident {
    .content {
        &[contenteditable="true"] {
            min-height: 60px;
        }
    }

    .date {
        font-size: 12px;
    }
}

.maintenance-bg-info {
    color: $maintenance;
}

.maintenance-icon {
    font-size: 35px;
    vertical-align: middle;
}

.shadow-box {
    background-color: #0d1117;
}

.status-maintenance {
    color: $maintenance;
    margin-right: 5px;
}

.mobile {
    h1 {
        font-size: 22px;
    }

    .overall-status {
        font-size: 20px;
    }
}


.domain-name-list {
    li {
        display: flex;
        align-items: center;
        padding: 10px 0 10px 10px;

        .domain-input {
            flex-grow: 1;
            background-color: transparent;
            border: none;
            color: $dark-font-color;
            outline: none;

            &::placeholder {
                color: #1d2634;
            }
        }
    }
}

.bg-maintenance {
    .alert-heading {
        font-weight: bold;
    }
}

.refresh-info {
    opacity: 0.7;
}

</style>
