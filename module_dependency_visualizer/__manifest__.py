# -*- coding: utf-8 -*-
{
    'name': "Module Dependency Visualizer",
    'summary': "Interactive visualization of Odoo modules dependencies",
    'author': "Jonas Bonilla",
    'website': "https://github.com/jonasbonilla/module_dependency_visualizer",
    'category': 'Technical Settings',
    'version': '17.0.1.0.0',
    'depends': [
        'base',
        'web',
    ],
    'data': [
        "views/menu_action_view.xml"
    ],
    'assets': {
        'web.assets_backend': [
            'module_dependency_visualizer/static/src/components/**/*',
        ],
    },
    'license': 'AGPL-3',
    'installable': True,
    "application": False,
}