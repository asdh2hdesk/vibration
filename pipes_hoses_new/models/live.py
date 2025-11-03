from odoo import models, fields, api
import json
import math
from datetime import datetime, timedelta
import random


class VibrationMonitor(models.Model):
    _inherit = 'vibration.monitor'

    is_live = fields.Boolean(string='Live Mode', default=False)
    total_records_generated = fields.Integer(string='Total Records', default=0)
    last_generation_time = fields.Datetime(string='Last Generation Time')

    def action_toggle_live_mode(self):
        """Toggle live mode on/off"""
        self.ensure_one()
        self.is_live = not self.is_live

        if self.is_live:
            message = 'Live mode started. Data will be generated via polling.'
            msg_type = 'success'
        else:
            message = 'Live mode stopped.'
            msg_type = 'info'

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': message,
                'type': msg_type,
                'sticky': False,
            }
        }

    def action_generate_next_record(self):
        """
        Generate next record if live mode is active and enough time has passed.
        Called by frontend polling.
        """
        self.ensure_one()

        if not self.is_live:
            return {'success': False, 'message': 'Live mode is not active'}

        # Check if 1 second has passed since last generation
        now = datetime.now()
        if self.last_generation_time:
            time_diff = (now - self.last_generation_time).total_seconds()
            if time_diff < 1.0:
                return {
                    'success': False,
                    'message': 'Too soon',
                    'wait': 1.0 - time_diff
                }

        # Generate the record
        try:
            self._generate_single_record()
            return {
                'success': True,
                'total_records': self.total_records_generated,
                'message': 'Record generated'
            }
        except Exception as e:
            return {
                'success': False,
                'message': str(e)
            }

    def _generate_single_record(self):
        """Generate ONE new record"""
        self.ensure_one()

        amplitude_map = {'2hz': 50, '3hz': 25, '5hz': 12.5, '7hz': 8.3}
        max_amplitude = amplitude_map.get(self.frequency_variant, 50)
        sample_degrees = self._get_sample_points_for_cycle()
        num_cycles = int(self.frequency_value)

        # Get next cycle number
        last_cycle = self.env['vibration.cycle.data'].search(
            [('monitor_id', '=', self.id)],
            order='cycle_number desc',
            limit=1
        )
        next_cycle_number = (last_cycle.cycle_number + 1) if last_cycle else 1

        start_time = datetime.now()
        cycle_duration = 1.0 / num_cycles
        cycle_data = {
            'monitor_id': self.id,
            'cycle_number': next_cycle_number,
            'timestamp': start_time,
        }
        all_data_points = []

        for cycle in range(num_cycles):
            cycle_start_offset = cycle * cycle_duration
            for i, degree in enumerate(sample_degrees):
                time_offset = (i / (len(sample_degrees) - 1)) * cycle_duration
                time_in_second = cycle_start_offset + time_offset
                timestamp = start_time + timedelta(seconds=time_in_second)

                planned_value = self._calculate_displacement(degree, max_amplitude)
                actual_value = planned_value * random.uniform(0.95, 1.05)

                all_data_points.append({
                    'cycle': cycle + 1,
                    'degree': degree,
                    'time': time_in_second,
                    'planned': planned_value,
                    'actual': actual_value
                })

                self.env['vibration.data.log'].create({
                    'monitor_id': self.id,
                    'cycle_number': next_cycle_number,
                    'sub_cycle_number': cycle + 1,
                    'degree': degree,
                    'dimension': round(planned_value, 2),
                    'amplitude': round(actual_value, 2),
                    'timestamp': timestamp,
                    'time_in_cycle': round(time_offset, 4),
                    'time_actual': round(time_in_second, 4),
                })

        # Store first cycle in fields
        for i, degree in enumerate(sample_degrees):
            point = all_data_points[i]
            cycle_data[f'degree_{degree}_planned'] = round(point['planned'], 2)
            cycle_data[f'degree_{degree}_actual'] = round(point['actual'], 2)
            cycle_data[f'degree_{degree}_planned_time'] = round(point['time'], 4)
            cycle_data[f'degree_{degree}_actual_time'] = round(point['time'], 4)

        cycle_data['all_data_points'] = json.dumps(all_data_points)
        self.env['vibration.cycle.data'].create(cycle_data)

        # Update counters
        self.total_records_generated = next_cycle_number
        self.last_update = fields.Datetime.now()
        self.last_generation_time = fields.Datetime.now()

    def check_live_status(self):
        """Check if live mode is active - called by frontend"""
        self.ensure_one()
        return {
            'is_live': self.is_live,
            'total_records': self.total_records_generated,
        }

    @api.model
    def get_all_live_monitors(self):
        """Get all monitors in live mode"""
        live_monitors = self.search([('is_live', '=', True)])
        return [{
            'id': m.id,
            'frequency': m.frequency_variant,
            'total_records': m.total_records_generated,
        } for m in live_monitors]


class VibrationDashboard(models.Model):
    _inherit = 'vibration.dashboard'

    is_any_monitor_live = fields.Boolean(
        string='Any Monitor Live',
        compute='_compute_is_any_monitor_live'
    )

    @api.depends()
    def _compute_is_any_monitor_live(self):
        """Check if any monitor is in live mode"""
        for record in self:
            live_count = self.env['vibration.monitor'].search_count([
                ('is_live', '=', True)
            ])
            record.is_any_monitor_live = live_count > 0

    def get_dashboard_refresh_data(self):
        """Get latest data for dashboard refresh"""
        self.ensure_one()

        # Force recompute
        self._compute_chart_data()
        self._compute_cycle_data()

        return {
            'chart_data': self.chart_data,
            'cycle_count': len(self.cycle_data_ids),
            'is_any_monitor_live': self.is_any_monitor_live,
        }