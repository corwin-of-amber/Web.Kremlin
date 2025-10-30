<template>
    <div>App</div>
</template>

<script lang="ts">
import { Vue, Component, toNative } from 'vue-facing-decorator';

@Component
class IApp extends Vue {

}

export default toNative(IApp);
</script>