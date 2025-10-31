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
        """Compute cycle data for the selected frequency"""
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)
                if monitor:
                    record.cycle_data_ids = self.env['vibration.cycle.data'].search([
                        ('monitor_id', '=', monitor.id)
                    ], order='cycle_number asc')
                else:
                    record.cycle_data_ids = self.env['vibration.cycle.data']
            else:
                record.cycle_data_ids = self.env['vibration.cycle.data']

    @api.depends('selected_frequency')
    def _compute_chart_data(self):
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)

                if monitor:
                    # Store frequency value
                    record.frequency_value = monitor.frequency_value

                    # Get cycle data to extract planned values
                    cycle_data = self.env['vibration.cycle.data'].search([
                        ('monitor_id', '=', monitor.id)
                    ], limit=1, order='cycle_number desc')

                    # Parse planned data if available
                    planned_values = {}
                    if cycle_data and cycle_data.chart_data:
                        try:
                            chart_json = json.loads(cycle_data.chart_data)
                            if 'planned' in chart_json:
                                for item in chart_json['planned']:
                                    planned_values[item['degree']] = item['value']
                        except:
                            pass

                    # Get actual logs
                    logs = self.env['vibration.data.log'].search([
                        ('monitor_id', '=', monitor.id)
                    ], order='time_actual asc')

                    # Prepare data in the format expected by cycle chart
                    planned_data = []
                    actual_data = []

                    for log in logs:
                        # Add actual data point - FIXED: use amplitude instead of actual_value
                        actual_data.append({
                            'degree': log.degree,
                            'value': log.amplitude,  # Changed from log.actual_value
                            'time': log.time_actual,
                            'cycle': log.sub_cycle_number,  # Changed from cycle_number to sub_cycle_number
                        })

                        # Add planned data point if we have planned values
                        if log.degree in planned_values:
                            planned_data.append({
                                'degree': log.degree,
                                'value': planned_values[log.degree],
                                'time': log.time_actual,
                                'cycle': log.sub_cycle_number,  # Changed from cycle_number to sub_cycle_number
                            })

                    # If no planned values found, use dimension as planned
                    if not planned_data and actual_data:
                        # Re-fetch logs to get dimension values
                        for log in logs:
                            planned_data.append({
                                'degree': log.degree,
                                'value': log.dimension,  # Use dimension as planned value
                                'time': log.time_actual,
                                'cycle': log.sub_cycle_number,
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