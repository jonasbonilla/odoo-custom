# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrModuleModule(models.Model):
    _inherit = 'ir.module.module'

    def get_module_dependency_graph(self):
        data = ModuleGraphBuilder.build_graph(self)
        return data


class ModuleGraphBuilder:
    @staticmethod
    def build_graph(modules):
        """
        Construye el grafo de módulos.

        :param modules: recordset de ir.module.module
        :return: dict{'nodes': [...], 'edges': [...]}
        """
        nodes = []
        edges = []
        visited = set()  # IDs de módulos ya procesados
        stack = list(modules)  # Pila para recorrido DFS

        while stack:
            mod = stack.pop()
            if mod.id in visited:
                continue
            visited.add(mod.id)

            # Añadimos el nodo
            nodes.append({
                'id': mod.id,
                'label': mod.name,
                'state': mod.state,
            })

            # Procesamos dependencias
            for rel in mod.dependencies_id:
                target = rel.depend_id
                edges.append({
                    'from': mod.id,
                    'to': target.id,
                    'type': 'dependency',
                })
                if target.id not in visited:
                    stack.append(target)

            # Procesamos exclusiones
            for rel in mod.exclusion_ids:
                target = rel.exclusion_id
                edges.append({
                    'from': mod.id,
                    'to': target.id,
                    'type': 'exclusion',
                })
                if target.id not in visited:
                    stack.append(target)

        # Eliminamos aristas duplicadas
        unique_edges = []
        seen_edges = set()
        for edge in edges:
            key = (edge['from'], edge['to'], edge.get('type'))
            if key not in seen_edges:
                seen_edges.add(key)
                unique_edges.append(edge)

        return {'nodes': nodes, 'edges': unique_edges}