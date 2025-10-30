# -*- coding: utf-8 -*-
{
    'name': 'Vibration Testing Machine',
    'version': '18.0.1.0.0',
    'summary': 'Vibration Testing Machine',
    'author': 'Megha',
    'website': 'https://www.yourcompany.com',
    'depends': ['base', 'web', 'mail',],
    'data': [
        'security/ir.model.access.csv',
        'views/vibration_monitor_views.xml',
        'views/dashboard_views.xml',
        # 'views/menu_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            ('include', 'web._assets_helpers'),
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
            'pipes_hoses_new/static/src/js/vibration_chart.js',
            'pipes_hoses_new/static/src/xml/vibration_chart.xml',
            'pipes_hoses_new/static/src/js/dashboard_chart.js',
            'pipes_hoses_new/static/src/xml/dashboard_chart.xml',
            'pipes_hoses_new/static/src/js/cycle_chart.js',
            'pipes_hoses_new/static/src/xml/cycle_chart.xml',
            'pipes_hoses_new/static/src/js/dash.js'
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3', 
}