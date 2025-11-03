/** @odoo-module **/

import { FormController } from "@web/views/form/form_controller";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { onMounted, onWillUnmount } from "@odoo/owl";

export class LiveVibrationController extends FormController {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.dataGenInterval = null;

        onMounted(() => {
            this.startAutoRefreshIfNeeded();
        });

        onWillUnmount(() => {
            this.stopAutoRefresh();
        });
    }

    async startAutoRefreshIfNeeded() {
        // Only for dashboard
        if (this.props.resModel !== 'vibration.dashboard') return;

        // Check if already running
        const isLiveRunning = this.model.root.data.is_live_running;
        if (isLiveRunning) {
            this.startAutoRefresh();
        }
    }

    async startAutoRefresh() {
        // Stop any existing interval
        this.stopAutoRefresh();

        // Only for dashboard
        if (this.props.resModel !== 'vibration.dashboard') return;

        this.dataGenInterval = setInterval(async () => {
            try {
                const recordId = this.model.root.resId;
                if (!recordId) return;

                const selectedFreq = this.model.root.data.selected_frequency;
                const isLiveRunning = this.model.root.data.is_live_running;

                // Stop if live is not running
                if (!isLiveRunning) {
                    this.stopAutoRefresh();
                    return;
                }

                if (!selectedFreq) return;

                // Generate data for selected frequency
                await this.orm.call(
                    'vibration.dashboard',
                    'generate_live_data_for_frequency',
                    [selectedFreq]
                );

                // Reload dashboard to show new data
                await this.model.root.load();

            } catch (error) {
                console.error('Live generation error:', error);
            }
        }, 1000); // Every 1 second
    }

    stopAutoRefresh() {
        if (this.dataGenInterval) {
            clearInterval(this.dataGenInterval);
            this.dataGenInterval = null;
        }
    }

    // Override to detect button clicks
    async onRecordSaved(record) {
        await super.onRecordSaved(record);

        // Check if is_live_running changed
        const isLiveRunning = this.model.root.data.is_live_running;

        if (isLiveRunning) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
    }
}

export class LiveVibrationMonitorController extends FormController {
    // Monitor form doesn't need auto-generation anymore
    // User controls it via dashboard
}

registry.category("views").add("vibration_monitor_live", {
    ...registry.category("views").get("form"),
    Controller: LiveVibrationMonitorController,
});

// Register for dashboard views
registry.category("views").add("vibration_dashboard_live", {
    ...registry.category("views").get("form"),
    Controller: LiveVibrationController,
});