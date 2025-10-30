/** @odoo-module **/

import { FormController } from "@web/views/form/form_controller";
import { patch } from "@web/core/utils/patch";

patch(FormController.prototype, {
    async onFrequencyClick(frequency) {
        if (this.props.resModel === 'vibration.dashboard') {
            const record = this.model.root;
            await record.update({ selected_frequency: frequency });
        }
    },
});