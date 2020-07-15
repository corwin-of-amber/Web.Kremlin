<template>
    <div class="treeview__module" @click="visit">
        {{module.canonicalName}}
    </div>
</template>
<script>
export default {
    props: ['module'],
    methods: {
        visit() {
            this.$emit('action', {$type: 'visit', module: this.module});
        }
    }
};
</script>