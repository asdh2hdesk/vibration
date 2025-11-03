from odoo import models, fields, api
import json
import math
from datetime import datetime, timedelta


class VibrationDashboard(models.Model):
    _name = 'vibration.dashboard'
    _description = 'Vibration Monitoring Dashboard'

    name = fields.Char(string='Dashboard Name', default='Vibration Dashboard', readonly=True)

    # Frequency breakdown
    monitors_2hz = fields.Integer(string='2Hz Monitors', compute='_compute_frequency_breakdown')
    monitors_3hz = fields.Integer(string='3Hz Monitors', compute='_compute_frequency_breakdown')
    monitors_5hz = fields.Integer(string='5Hz Monitors', compute='_compute_frequency_breakdown')
    monitors_7hz = fields.Integer(string='7Hz Monitors', compute='_compute_frequency_breakdown')

    # Selected frequency for viewing details
    selected_frequency = fields.Selection([
        ('2hz', '2 Hz'),
        ('3hz', '3 Hz'),
        ('5hz', '5 Hz'),
        ('7hz', '7 Hz'),
    ], string='Selected Frequency')

    is_live_running = fields.Boolean(
        string='Is Live Running',
        compute='_compute_is_live_running',
        store=False
    )

    # Chart data
    chart_data = fields.Text(string='Chart Data (JSON)', compute='_compute_chart_data')

    # Store frequency value for the widget
    frequency_value = fields.Float(string='Frequency Value', compute='_compute_chart_data')

    # Cycle data for the selected frequency
    cycle_data_ids = fields.One2many('vibration.cycle.data', compute='_compute_cycle_data',
                                     string='Cycle Data')

    @api.depends()
    def _compute_frequency_breakdown(self):
        for record in self:
            VibrationMonitor = self.env['vibration.monitor']
            record.monitors_2hz = VibrationMonitor.search_count([('frequency_variant', '=', '2hz')])
            record.monitors_3hz = VibrationMonitor.search_count([('frequency_variant', '=', '3hz')])
            record.monitors_5hz = VibrationMonitor.search_count([('frequency_variant', '=', '5hz')])
            record.monitors_7hz = VibrationMonitor.search_count([('frequency_variant', '=', '7hz')])

    @api.depends('selected_frequency')
    def _compute_cycle_data(self):
        """Compute ALL cycle data for the selected frequency"""
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)
                if monitor:
                    # Get ALL cycle data (not just 1)
                    record.cycle_data_ids = self.env['vibration.cycle.data'].search([
                        ('monitor_id', '=', monitor.id)
                    ], order='cycle_number desc')  # Show newest first
                else:
                    record.cycle_data_ids = self.env['vibration.cycle.data']
            else:
                record.cycle_data_ids = self.env['vibration.cycle.data']

    @api.depends('selected_frequency')
    def _compute_chart_data(self):
        """Compute cumulative chart data showing ALL records"""
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)

                if monitor:
                    record.frequency_value = monitor.frequency_value

                    # Get ALL data logs for cumulative display
                    logs = self.env['vibration.data.log'].search([
                        ('monitor_id', '=', monitor.id)
                    ], order='timestamp asc, time_actual asc')

                    if not logs:
                        record.chart_data = json.dumps({'planned': [], 'actual': []})
                        return

                    # Prepare cumulative data arrays
                    planned_data = []
                    actual_data = []

                    # Calculate cumulative time offset
                    cumulative_time = 0.0
                    last_cycle_number = 0

                    for log in logs:
                        # When we move to a new cycle, add 1 second to cumulative time
                        if log.cycle_number != last_cycle_number:
                            if last_cycle_number > 0:  # Not the first cycle
                                cumulative_time += 1.0
                            last_cycle_number = log.cycle_number

                        # Add the time within this cycle to cumulative time
                        point_time = cumulative_time + log.time_actual

                        # Add actual data point
                        actual_data.append({
                            'degree': log.degree,
                            'value': log.amplitude,
                            'time': point_time,
                            'cycle': log.cycle_number,
                            'sub_cycle': log.sub_cycle_number,
                        })

                        # Add planned data point
                        planned_data.append({
                            'degree': log.degree,
                            'value': log.dimension,
                            'time': point_time,
                            'cycle': log.cycle_number,
                            'sub_cycle': log.sub_cycle_number,
                        })

                    record.chart_data = json.dumps({
                        'planned': planned_data,
                        'actual': actual_data
                    })
                else:
                    record.chart_data = json.dumps({'planned': [], 'actual': []})
                    record.frequency_value = 0.0
            else:
                record.chart_data = json.dumps({'planned': [], 'actual': []})
                record.frequency_value = 0.0

    def action_refresh_dashboard(self):
        """Refresh dashboard data"""
        self.ensure_one()
        # Recompute all statistics
        self._compute_frequency_breakdown()
        self._compute_cycle_data()
        self._compute_chart_data()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Dashboard refreshed successfully',
                'type': 'success',
                'sticky': False,
            }
        }

    def action_clear_selection(self):
        """Clear frequency selection"""
        self.ensure_one()
        self.selected_frequency = False
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def action_view_all_monitors(self):
        """Open all monitors view"""
        return {
            'type': 'ir.actions.act_window',
            'name': 'All Monitors',
            'res_model': 'vibration.monitor',
            'view_mode': 'tree,form',
            'domain': [],
            'context': {'create': True}
        }

    def action_view_selected_logs(self):
        """View logs for selected frequency"""
        self.ensure_one()
        if not self.selected_frequency:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'Please select a frequency first',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        monitor = self.env['vibration.monitor'].search([
            ('frequency_variant', '=', self.selected_frequency)
        ], limit=1)

        if not monitor:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'No monitor found for selected frequency',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        return {
            'name': f'{self.selected_frequency.upper()} Data Logs',
            'type': 'ir.actions.act_window',
            'res_model': 'vibration.data.log',
            'view_mode': 'tree,form',
            'domain': [('monitor_id', '=', monitor.id)],
            'context': {'default_monitor_id': monitor.id},
        }

    def action_start_live_generation(self):
        """Start live data generation for selected frequency"""
        self.ensure_one()
        if not self.selected_frequency:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'Please select a frequency first',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        monitor = self.env['vibration.monitor'].search([
            ('frequency_variant', '=', self.selected_frequency)
        ], limit=1)

        if not monitor:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'No monitor found for selected frequency',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        monitor.write({'is_live': True})
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'Live generation started for {self.selected_frequency.upper()}',
                'type': 'success',
                'sticky': False,
            }
        }

    def action_stop_live_generation(self):
        """Stop live data generation"""
        self.ensure_one()
        if not self.selected_frequency:
            return True

        monitor = self.env['vibration.monitor'].search([
            ('frequency_variant', '=', self.selected_frequency)
        ], limit=1)

        if monitor:
            monitor.write({'is_live': False})

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Live generation stopped',
                'type': 'info',
                'sticky': False,
            }
        }

    @api.depends('selected_frequency')
    def _compute_is_live_running(self):
        """Check if the selected frequency monitor is in live mode"""
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)
                record.is_live_running = monitor.is_live if monitor else False
            else:
                record.is_live_running = False

    def action_toggle_live_generation(self):
        """Toggle live data generation for selected frequency"""
        self.ensure_one()
        if not self.selected_frequency:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'Please select a frequency first',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        monitor = self.env['vibration.monitor'].search([
            ('frequency_variant', '=', self.selected_frequency)
        ], limit=1)

        if not monitor:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'No monitor found for selected frequency',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        # Toggle the is_live state
        new_state = not monitor.is_live
        monitor.write({'is_live': new_state})

        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    @api.model
    def generate_live_data_for_frequency(self, frequency_variant):
        """Generate one second of data for specific frequency"""
        monitor = self.env['vibration.monitor'].search([
            ('frequency_variant', '=', frequency_variant),
            ('is_live', '=', True)
        ], limit=1)

        if not monitor:
            return {'success': False, 'message': 'Monitor not in live mode'}

        # Call the generation logic from monitor
        return monitor.action_generate_next_record()