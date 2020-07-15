import Vue from 'vue';

// @ts-ignore
import treeview from './components/tree.vue';
import './components/tree.css';

Vue.component('generic-tree', treeview);

// @ts-ignore
import moduleNode from './components/module-node.vue';
Vue.component('module-node', moduleNode);

import { ModuleRef, SourceFile } from '../modules';
import { AcornCrawl } from '../bundle';



class ModuleDepNavigator {
    view: ModuleDepComponent

    constructor(ac: AcornCrawl, main: string | ModuleRef) {
        if (typeof main === 'string')
            main = new SourceFile(main);

        this.view = new (Vue.component('generic-tree'))({
            propsData: {defaultComponent: 'module-node'}
        }).$mount() as ModuleDepComponent;
        this.view.root = {module: main};

        var m = ac.peek(main);
        this.view.children = m.deps.map(x => ({root: {module: x.target}}))

        this.view.$on('action', (ev) => {
            if (ev.subtree.children.length === 0) {
                var m = ac.peek(ev.module);
                console.log(m);
                ev.subtree.children.splice(0, Infinity,
                        ...m.deps.map(x => ({root: {module: x.target}})));
            }
        });
    }
}

declare type ModuleDepComponent = TreeViewComponent<{module: ModuleRef}>;

declare type TreeViewComponent<T> = Vue & TreeViewNode<T>;

declare class TreeViewNode<T> {
    root: T
    children?: TreeViewNode<T>[]
}


Object.assign(window, {Vue});


export { ModuleDepNavigator }