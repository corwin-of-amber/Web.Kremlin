<template>
    <li class="treeview" :class="{'treeview__expand': expand, 'treeview__leaf': !(children && children.length)}">
        <span class="treeview__handle" @click="toggle"></span>
        <div ref="root" v-if="root" class="treeview__root">
            <component :is="root._component || defaultComponent"
                v-bind="(typeof root == 'string') ? {text: root} : root"
                @action="action($event)" />
        </div>
        <ul ref="children" v-if="children && children.length" class="treeview__children">
            <treeview v-for="(child, index) in children" :key="index"
                :root="child.root" :children="child.children"
                :defaultComponent="defaultComponent"
                @action="action($event)" />
        </ul>
    </li>
</template>
<script>
var treeview = {
    props: {
        root: null,
        children: {default: () => []},
        defaultComponent: {default: 'treeview-element'}
    },
    data: () => ({expand: true}),
    methods: {
        action(event) {
            if (!event.subtree) event.subtree = this;
            this.$emit('action', event);
        },
        toggle() {
            this.expand = !this.expand;
        }
    }
};

treeview.components = {
    treeview,  // recursive!
    'treeview-element': {
        functional: true,
        render(createElement, context) {
            var span = createElement('span');
            span.text = context.props.text || '';
            return span;
        }
    }
};


export default treeview;
</script>