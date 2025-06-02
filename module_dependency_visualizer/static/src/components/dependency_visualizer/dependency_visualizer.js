/** @odoo-module */

import { debounce } from "@web/core/utils/timing";
import { registry } from '@web/core/registry';
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { useService } from '@web/core/utils/hooks';
import { useRef, Component, onWillStart, onWillUnmount, onMounted, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

const state_color = {
    'uninstallable': '#eaeaa4',
    'installed': '#97c2fc',
    'uninstalled': '#e5f8fc',
    'to install': '#939afc',
    'to upgrade': '#AEFCAB',
    'to remove': '#fcadb7',
};

export class DependencyVisualizer extends Component {
    setup() {

        this.controlPanelDisplay = {};
        this.breadcrumbs = useState(this.env.config.breadcrumbs);
        this.notification = useService("notification");
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.print = false;

        this._edgeSet = new Set();
        this.help_info = useRef('help_info');
        this.container = useRef('mynetwork');
        this.state = useState({
            searchText: "",
            moduleCount: 0
        });

        this.nodes = [];
        this.edges = [];
        this.graph_nodes = new vis.DataSet();
        this.graph_edges = new vis.DataSet();
        this.graph_options = { edges: { arrows: 'to' } };
        this.graph_data = { nodes: this.graph_nodes, edges: this.graph_edges };

        // Debounce input handler
        this.onInputKeyup = debounce(this.onInputKeyup, 70);

        onWillStart(this.onWillStart);
        onWillUnmount(this.onInputKeyup.cancel);
        onMounted(this.onMounted);
    }

    /**
     * @override
     * Fetch modules init information.
     */
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
        this.state.moduleCount = this.nodes.length;
    }

    /**
     * @override
     */
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
        this.network.once("afterDrawing", () => {
            if (this.print) {
                this._exportPng(canvasElement);
            }
        });
    }

    async onInputKeyup(event) {
        this.state.searchText = event.target.value;
        this.filterModules(this.state.searchText.trim().toUpperCase());
    }

    filterModules(module) {
        this._inputQuery = module;
        this.state.moduleCount = 0;
        const items = document.querySelectorAll('.module_graph_nav_list li');
        items.forEach(item => {
            const text = item.textContent.trim().toUpperCase();
            const isVisible = !module || text.includes(module);
            item.style.display = isVisible ? '' : 'none';
            if (isVisible === true) this.state.moduleCount += 1;
        });
    }

    onClickModuleInfo(module_id) {
        this.actionService.doAction({
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

        const help_info = this.help_info.el;
        help_info.classList.add('d-none');
        const moduleId    = Number(idStr);
        const moduleLabel = target.getAttribute('data-name');

        // Limpiar grafo existente
        this.edges = [];
        this._edgeSet.clear();
        this.graph_nodes.clear();
        this.graph_edges.clear();
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

        this._hasRendered = true;
    }

    clearSearch() {
        this.state.searchText = "";
        this.filterModules('');
    }

    printPng() {
        if (!this.network) {
            this.notification.add("El grafo no está inicializado.", { type: "warning" });
            console.warn("Intento de generar PNG pero la instancia de vis.js Network no existe.");
            return;
        }

        const canvasElement = this.network.canvas.frame?.canvas;
        if (!canvasElement) {
            this.notification.add("No se pudo encontrar el canvas del grafo.", { type: "danger" });
            console.error("Elemento canvas no encontrado dentro de la instancia de vis.js network.");
            return;
        }

        // Asegurarse de que al menos el grafo ya se haya renderizado alguna vez
        if (!this._hasRendered) {
            this.notification.add("El grafo aún no ha terminado de renderizarse. Se exportará el PNG cuando finalice el primer renderizado.", { type: "info" });
        } else {
            this.print = true;
            this._exportPng(canvasElement);
        }
        this.print = false;
    }

    _exportPng(canvasElement) {
        try {
            const dataURL = canvasElement.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = dataURL;
            link.download = "grafo.png";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.notification.add("PNG del grafo generado y descarga iniciada.", { type: "success" });
        } catch (error) {
            console.error("Error generando PNG del grafo:", error);
            this.notification.add(`Error al generar PNG: ${error.message || error}`, { type: "danger" });
        }
    }


}

DependencyVisualizer.template = 'module_dependency_visualizer.DependencyVisualizer';
DependencyVisualizer.components = {
    ControlPanel,
};

registry.category('actions').add('ac_module_dependency_visualizer', DependencyVisualizer);