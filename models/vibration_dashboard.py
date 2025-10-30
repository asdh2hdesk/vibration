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

    def action_select_frequency(self, frequency):
        """Set selected frequency and show its logs"""
        self.ensure_one()
        self.selected_frequency = frequency
        return self.action_view_selected_logs()

    def action_clear_selection(self):
        self.selected_frequency = False

    def action_select_frequency_2hz(self):
        return self._select_frequency('2hz')

    def action_select_frequency_3hz(self):
        return self._select_frequency('3hz')

    def action_select_frequency_5hz(self):
        return self._select_frequency('5hz')

    def action_select_frequency_7hz(self):
        return self._select_frequency('7hz')

    def _select_frequency(self, frequency):
        """Helper to set selected frequency and open logs"""
        self.ensure_one()
        self.selected_frequency = frequency
        return self.action_view_selected_logs()

    # Data log IDs for the selected frequency
    # data_log_ids = fields.One2many('vibration.data.log', compute='_compute_data_logs',
    #                                string='Data Logs')

    @api.depends()
    def _compute_frequency_breakdown(self):
        for record in self:
            VibrationMonitor = self.env['vibration.monitor']
            record.monitors_2hz = VibrationMonitor.search_count([('frequency_variant', '=', '2hz')])
            record.monitors_3hz = VibrationMonitor.search_count([('frequency_variant', '=', '3hz')])
            record.monitors_5hz = VibrationMonitor.search_count([('frequency_variant', '=', '5hz')])
            record.monitors_7hz = VibrationMonitor.search_count([('frequency_variant', '=', '7hz')])

    @api.depends('selected_frequency')
    def _compute_data_logs(self):
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)
                if monitor:
                    record.data_log_ids = self.env['vibration.data.log'].search([
                        ('monitor_id', '=', monitor.id)
                    ], order='timestamp asc')
                else:
                    record.data_log_ids = self.env['vibration.data.log']
            else:
                record.data_log_ids = self.env['vibration.data.log']

    @api.depends('selected_frequency')
    def _compute_chart_data(self):
        for record in self:
            if record.selected_frequency:
                monitor = self.env['vibration.monitor'].search([
                    ('frequency_variant', '=', record.selected_frequency)
                ], limit=1)

                if monitor:
                    logs = self.env['vibration.data.log'].search([
                        ('monitor_id', '=', monitor.id)
                    ], order='time_actual asc')

                    data_points = [{
                        'time_actual': log.time_actual,
                        'dimension': log.dimension,
                        'degree': log.degree,
                        'cycle': log.cycle_number,
                    } for log in logs]

                    record.chart_data = json.dumps(data_points)
                else:
                    record.chart_data = json.dumps([])
            else:
                record.chart_data = json.dumps([])

    def action_refresh_dashboard(self):
        """Refresh dashboard data"""
        self.ensure_one()
        # Recompute all statistics
        self._compute_frequency_breakdown()
        self._compute_data_logs()
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

    def action_select_frequency(self, frequency):
        """Select a frequency to view details"""
        self.ensure_one()
        self.selected_frequency = frequency
        return True

    def action_clear_selection(self):
        """Clear frequency selection"""
        self.ensure_one()
        self.selected_frequency = False
        return True

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
            return

        monitor = self.env['vibration.monitor'].search([
            ('frequency_variant', '=', self.selected_frequency)
        ], limit=1)

        if not monitor:
            return

        return {
            'name': f'{self.selected_frequency.upper()} Data Logs',
            'type': 'ir.actions.act_window',
            'res_model': 'vibration.data.log',
            'view_mode': 'tree,form',
            'domain': [('monitor_id', '=', monitor.id)],
            'context': {'default_monitor_id': monitor.id},
        }


