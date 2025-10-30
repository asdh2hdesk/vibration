from odoo import models, fields, api
import json
import math
from datetime import datetime, timedelta


class VibrationMonitor(models.Model):
    _name = 'vibration.monitor'
    _description = 'Vibration Monitoring'
    _rec_name = 'frequency_variant'

    frequency_variant = fields.Selection([
        ('2hz', '2 Hz'),
        ('3hz', '3 Hz'),
        ('5hz', '5 Hz'),
        ('7hz', '7 Hz'),
    ], string='Frequency', required=True, default='7hz')

    frequency_value = fields.Float(string='Frequency (Hz)', compute='_compute_frequency_value')
    amplitude_threshold = fields.Char(string='Amplitude Threshold', compute='_compute_amplitude_threshold')
    dimension_range = fields.Char(string='Dimension Range (MM)', compute='_compute_dimension_range')
    movement_cycles = fields.Integer(string='Movement Cycles', compute='_compute_movement_cycles')

    plc_ip_address = fields.Char(string='PLC IP Address', help='Ethernet IP address for PLC connection')
    plc_port = fields.Integer(string='PLC Port', default=44818)
    is_connected = fields.Boolean(string='PLC Connected', default=False)

    active = fields.Boolean(default=True)
    chart_data = fields.Text(string='Chart Data (JSON)')
    last_update = fields.Datetime(string='Last Update', default=fields.Datetime.now)

    cycle_data_ids = fields.One2many('vibration.cycle.data', 'monitor_id', string='Data')

    @api.depends('frequency_variant')
    def _compute_frequency_value(self):
        freq_map = {'2hz': 2, '3hz': 3, '5hz': 5, '7hz': 7}
        for record in self:
            record.frequency_value = freq_map.get(record.frequency_variant, 0)

    @api.depends('frequency_variant')
    def _compute_amplitude_threshold(self):
        amp_map = {'2hz': 'R', '3hz': 'R/2', '5hz': 'R/4', '7hz': 'R/6'}
        for record in self:
            record.amplitude_threshold = amp_map.get(record.frequency_variant, 'R')

    @api.depends('frequency_variant')
    def _compute_dimension_range(self):
        dim_map = {
            '2hz': '-50 to +50',
            '3hz': '-25 to +25',
            '5hz': '-12.5 to +12.5',
            '7hz': '-8.3 to +8.3'
        }
        for record in self:
            record.dimension_range = dim_map.get(record.frequency_variant, '')

    @api.depends('frequency_variant')
    def _compute_movement_cycles(self):
        cycles_map = {'2hz': 518400, '3hz': 1166400, '5hz': 3240000, '7hz': 6652800}
        for record in self:
            record.movement_cycles = cycles_map.get(record.frequency_variant, 0)

    def _get_sample_points_for_cycle(self):
        """Generate 9 sample points per cycle (0° to 360° in 45° increments)"""
        return [0, 45, 90, 135, 180, 225, 270, 315, 360]

    def _calculate_displacement(self, degree, amplitude):
        """Calculate displacement using sine wave formula"""
        radians = math.radians(degree)
        return amplitude * math.sin(radians)

    def action_generate_simulated_data(self):
        """Generate simulated vibration data for testing"""
        self.ensure_one()

        amplitude_map = {
            '2hz': 50,
            '3hz': 25,
            '5hz': 12.5,
            '7hz': 8.3
        }
        max_amplitude = amplitude_map.get(self.frequency_variant, 50)

        sample_degrees = self._get_sample_points_for_cycle()
        num_cycles = int(self.frequency_value)

        # Delete existing logs
        self.env['vibration.data.log'].search([('monitor_id', '=', self.id)]).unlink()
        self.env['vibration.cycle.data'].search([('monitor_id', '=', self.id)]).unlink()

        start_time = datetime.now()
        total_duration = 1.0  # 1 second total
        cycle_duration = total_duration / num_cycles

        # Generate data for each cycle
        for cycle in range(num_cycles):
            cycle_start_time = start_time + timedelta(seconds=cycle * cycle_duration)

            # Create cycle record
            cycle_data = {
                'monitor_id': self.id,
                'cycle_number': cycle + 1,
                'timestamp': cycle_start_time,
            }

            # Generate data for each degree in this cycle
            for i, degree in enumerate(sample_degrees):
                time_offset_in_cycle = (i / (len(sample_degrees) - 1)) * cycle_duration
                time_actual = cycle * cycle_duration + time_offset_in_cycle
                timestamp = cycle_start_time + timedelta(seconds=time_offset_in_cycle)

                planned_value = self._calculate_displacement(degree, max_amplitude)
                # Add small variation for actual value (±5%)
                import random
                actual_value = planned_value * random.uniform(0.95, 1.05)

                # Store in cycle data dictionary
                cycle_data[f'degree_{degree}_planned'] = round(planned_value, 2)
                cycle_data[f'degree_{degree}_actual'] = round(actual_value, 2)
                cycle_data[f'degree_{degree}_planned_time'] = round(time_offset_in_cycle, 4)
                cycle_data[f'degree_{degree}_actual_time'] = round(time_offset_in_cycle + random.uniform(-0.001, 0.001),
                                                                   4)

                # Also create individual log entries
                self.env['vibration.data.log'].create({
                    'monitor_id': self.id,
                    'cycle_number': cycle + 1,
                    'degree': degree,
                    'dimension': round(planned_value, 2),
                    'amplitude': round(planned_value, 2),
                    'timestamp': timestamp,
                    'time_in_cycle': round(time_offset_in_cycle, 4),
                    'time_actual': round(time_actual, 4),
                })

            # Create the cycle record with all degree data
            self.env['vibration.cycle.data'].create(cycle_data)

        self.last_update = fields.Datetime.now()

        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def action_connect_plc(self):
        """Connect to PLC"""
        self.ensure_one()
        if not self.plc_ip_address:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'Please enter PLC IP address',
                    'type': 'warning',
                    'sticky': False,
                }
            }

        self.is_connected = True
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'Connected to PLC at {self.plc_ip_address} (Simulated)',
                'type': 'info',
                'sticky': False,
            }
        }

    def action_disconnect_plc(self):
        """Disconnect from PLC"""
        self.ensure_one()
        self.is_connected = False
        return True

    def action_toggle_connection(self):
        """Toggle connection status"""
        self.ensure_one()
        if self.is_connected:
            return self.action_disconnect_plc()
        else:
            return self.action_connect_plc()

    data_log_count = fields.Integer(string='Data Log Count', compute='_compute_data_log_count')
    cycle_data_count = fields.Integer(string='Cycle Count', compute='_compute_cycle_data_count')

    def _compute_data_log_count(self):
        for record in self:
            record.data_log_count = self.env['vibration.data.log'].search_count([
                ('monitor_id', '=', record.id)
            ])

    def _compute_cycle_data_count(self):
        for record in self:
            record.cycle_data_count = self.env['vibration.cycle.data'].search_count([
                ('monitor_id', '=', record.id)
            ])

    def action_view_data_logs(self):
        self.ensure_one()
        return {
            'name': 'Vibration Data Logs',
            'type': 'ir.actions.act_window',
            'res_model': 'vibration.data.log',
            'view_mode': 'list,form',
            'domain': [('monitor_id', '=', self.id)],
            'context': {'default_monitor_id': self.id},
        }

    def action_view_cycle_data(self):
        self.ensure_one()
        return {
            'name': f'{self.frequency_variant.upper()} Cycle Data with Charts',
            'type': 'ir.actions.act_window',
            'res_model': 'vibration.cycle.data',
            'view_mode': 'list,form',
            'domain': [('monitor_id', '=', self.id)],
            'context': {'default_monitor_id': self.id},
            'target': 'current',
        }
class VibrationDataLog(models.Model):
    _name = 'vibration.data.log'
    _description = 'Vibration Data Log'
    _order = 'timestamp desc'

    monitor_id = fields.Many2one('vibration.monitor', string='Monitor', required=True, ondelete='cascade')
    cycle_number = fields.Integer(string='Sr. No.')
    degree = fields.Float(string='Degree (°)')
    dimension = fields.Float(string='Dimension (MM)')
    amplitude = fields.Float(string='Amplitude')
    timestamp = fields.Datetime(string='Timestamp', required=True, default=fields.Datetime.now)
    time_in_cycle = fields.Float(string='Planned Time')
    time_actual = fields.Float(string='Actual Time')


class VibrationCycleData(models.Model):
    _name = 'vibration.cycle.data'
    _description = 'Vibration Cycle Data'
    _order = 'cycle_number asc'
    _rec_name = 'cycle_number'

    monitor_id = fields.Many2one('vibration.monitor', string='Monitor', required=True, ondelete='cascade')
    cycle_number = fields.Integer(string='Sr. No.', required=True)
    timestamp = fields.Datetime(string='Timestamp', required=True, default=fields.Datetime.now)
    frequency_value = fields.Float(string='Frequency (Hz)', related='monitor_id.frequency_value', store=False)

    # 0 degree
    degree_0_planned = fields.Float(string='0° Planned Value')
    degree_0_actual = fields.Float(string='0° Actual Value')
    degree_0_planned_time = fields.Float(string='0° Planned Time')
    degree_0_actual_time = fields.Float(string='0° Actual Time')

    # 45 degree
    degree_45_planned = fields.Float(string='45° Planned Value')
    degree_45_actual = fields.Float(string='45° Actual Value')
    degree_45_planned_time = fields.Float(string='45° Planned Time')
    degree_45_actual_time = fields.Float(string='45° Actual Time')

    # 90 degree
    degree_90_planned = fields.Float(string='90° Planned Value')
    degree_90_actual = fields.Float(string='90° Actual Value')
    degree_90_planned_time = fields.Float(string='90° Planned Time')
    degree_90_actual_time = fields.Float(string='90° Actual Time')

    # 135 degree
    degree_135_planned = fields.Float(string='135° Planned Value')
    degree_135_actual = fields.Float(string='135° Actual Value')
    degree_135_planned_time = fields.Float(string='135° Planned Time')
    degree_135_actual_time = fields.Float(string='135° Actual Time')

    # 180 degree
    degree_180_planned = fields.Float(string='180° Planned Value')
    degree_180_actual = fields.Float(string='180° Actual Value')
    degree_180_planned_time = fields.Float(string='180° Planned Time')
    degree_180_actual_time = fields.Float(string='180° Actual Time')

    # 225 degree
    degree_225_planned = fields.Float(string='225° Planned Value')
    degree_225_actual = fields.Float(string='225° Actual Value')
    degree_225_planned_time = fields.Float(string='225° Planned Time')
    degree_225_actual_time = fields.Float(string='225° Actual Time')

    # 270 degree
    degree_270_planned = fields.Float(string='270° Planned Value')
    degree_270_actual = fields.Float(string='270° Actual Value')
    degree_270_planned_time = fields.Float(string='270° Planned Time')
    degree_270_actual_time = fields.Float(string='270° Actual Time')

    # 315 degree
    degree_315_planned = fields.Float(string='315° Planned Value')
    degree_315_actual = fields.Float(string='315° Actual Value')
    degree_315_planned_time = fields.Float(string='315° Planned Time')
    degree_315_actual_time = fields.Float(string='315° Actual Time')

    # 360 degree
    degree_360_planned = fields.Float(string='360° Planned Value')
    degree_360_actual = fields.Float(string='360° Actual Value')
    degree_360_planned_time = fields.Float(string='360° Planned Time')
    degree_360_actual_time = fields.Float(string='360° Actual Time')

    chart_data = fields.Text(string='Chart', compute='_compute_chart_data')

    @api.depends('degree_0_planned', 'degree_0_actual', 'degree_45_planned', 'degree_45_actual',
                 'degree_90_planned', 'degree_90_actual', 'degree_135_planned', 'degree_135_actual',
                 'degree_180_planned', 'degree_180_actual', 'degree_225_planned', 'degree_225_actual',
                 'degree_270_planned', 'degree_270_actual', 'degree_315_planned', 'degree_315_actual',
                 'degree_360_planned', 'degree_360_actual')
    def _compute_chart_data(self):
        for record in self:
            degrees = [0, 45, 90, 135, 180, 225, 270, 315, 360]
            planned_data = []
            actual_data = []

            for deg in degrees:
                planned_data.append({
                    'degree': deg,
                    'value': getattr(record, f'degree_{deg}_planned', 0)
                })
                actual_data.append({
                    'degree': deg,
                    'value': getattr(record, f'degree_{deg}_actual', 0)
                })

            record.chart_data = json.dumps({
                'planned': planned_data,
                'actual': actual_data
            })

