import * as Vue from 'vue';
import App from './components/app.vue';

function main() {
    Vue.createApp(App).mount(document.body);
}

document.addEventListener('DOMContentLoaded', main);