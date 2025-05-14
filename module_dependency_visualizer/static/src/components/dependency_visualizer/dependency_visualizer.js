/** @odoo-module */

import { debounce } from "@web/core/utils/timing";
import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';
import { useRef, Component, onWillStart, onWillUnmount, onMounted } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

const state_color = {
    'uninstallable': '#eaeaa4',
    'installed': '#97c2fc',
    'uninstalled': '#e5f8fc',
    'to install': '#939afc',
    'to upgrade': '#AEFCAB',
    'to remove': '#fcadb7',
};

class DependencyVisualizer extends Component {
    setup() {

        this.orm = useService('orm');
        this.action = useService("action");
        this.container = useRef('mynetwork');

        // Cached state for performance
        this._inputQuery = '';
        this._edgeSet = new Set();

        this.nodes = [];
        this.edges = [];
        this.count = 0;
        this.graph_nodes = new vis.DataSet();
        this.graph_edges = new vis.DataSet();
        this.graph_data = { nodes: this.graph_nodes, edges: this.graph_edges };
        this.graph_options = { edges: { arrows: 'to' } };

        // Debounce input handler
        this.onInputKeyup = debounce(this.onInputKeyup, 70);

        onWillStart(this.onWillStart);
        onWillUnmount(this.onInputKeyup.cancel);
        onMounted(this.onMounted);
    }

    async onWillStart() {
        const modules = await this.orm.call("ir.module.module", "search_read", [], {
            fields: ["id", "name", "shortdesc", "state"],
            domain: [],
            order: 'shortdesc'
        });
        this.nodes = modules.map(m => ({
            id: m.id,
            label: m.name,
            state: m.state,
            shortdesc: m.shortdesc,
        }));
        this.count = this.nodes.length;
    }

    onMounted() {
        const containerEl = this.container.el;
        this.network = new vis.Network(containerEl, this.graph_data, this.graph_options);
        this.network.on('doubleClick', params => {
            const [module_id] = params.nodes;
            if (module_id) {
                this.onClickModuleInfo(module_id);
            }
        });
        this.network.on('oncontext', params => {
            params.event.preventDefault();
            params.event.stopPropagation();
            const [node_id] = params.nodes;
            if (node_id) {
                this.graph_nodes.remove(node_id);
                const li = document.querySelector(`li[data-id="${node_id}"]`);
                if (li) li.classList.remove('module_selected');
            }
        });
    }

    async onInputKeyup(event) {
        const query = event.target.value.trim().toUpperCase();
        if (query === this._inputQuery) return;
        this._inputQuery = query;
        const items = document.querySelectorAll('.module_graph_nav_list li');
        let visibleCount = 0;

        items.forEach(item => {
            const text = item.textContent.trim().toUpperCase();
            const isVisible = !query || text.includes(query);
            item.style.display = isVisible ? '' : 'none';
            if (isVisible) visibleCount++;
        });
        this.count = visibleCount;
    }

    onClickModuleInfo(module_id) {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: _t('Información del módulo'),
            target: 'new',
            res_model: 'ir.module.module',
            res_id: module_id,
            views: [[false, 'form']],
            view_mode: 'form',
        });
    }

    async onClickNavModule(event) {
        const target = event.target;
        const idStr  = target.getAttribute('data-id');
        if (!idStr || target.classList.contains('module_selected')) {
            return;
        }
        const moduleId    = Number(idStr);
        const moduleLabel = target.getAttribute('data-name');

        // Limpiar grafo existente
        this.graph_nodes.clear();
        this.graph_edges.clear();
        this.edges = [];
        this._edgeSet.clear();
        document.querySelectorAll('.module_graph_nav_list li.module_selected')
            .forEach(li => li.classList.remove('module_selected'));

        // Añadir nodo raíz y marcar como seleccionado
        this.graph_nodes.update([{ id: moduleId, label: moduleLabel }]);
        target.classList.add('module_selected');

        const moduleGraph = await this.orm.call(
            'ir.module.module',
            'get_module_dependency_graph',
            [moduleId]
        );

        // Construir y añadir nodos secundarios (excluyendo el raíz)
        const newNodes = moduleGraph.nodes
            .filter(n => n.id && n.id !== moduleId)
            .map(n => {
                const li = document.querySelector(`li[data-id="${n.id}"]`);
                if (li) li.classList.add('module_selected');
                return {
                    id: n.id,
                    label: n.label,
                    color: { background: state_color[n.state], state: n.state },
                };
            });
        if (newNodes.length) {
            this.graph_nodes.update(newNodes);
        }

        // Construir y añadir aristas únicas
        const newEdges = [];
        moduleGraph.edges.forEach(e => {
            const key = `${e.from}-${e.to}`;
            if (!this._edgeSet.has(key)) {
                this._edgeSet.add(key);
                const edge = { from: e.from, to: e.to };
                if (e.type === 'exclusion') {
                    edge.color = { color: 'red', highlight: 'red' };
                }
                this.edges.push(edge);
                newEdges.push(edge);
            }
        });
        if (newEdges.length) {
            this.graph_edges.update(newEdges);
        }
    }
}

DependencyVisualizer.template = 'module_dependency_visualizer.DependencyVisualizer';

registry.category('actions').add('ac_module_dependency_visualizer', DependencyVisualizer);

export default DependencyVisualizer;