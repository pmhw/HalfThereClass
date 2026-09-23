import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initStore } from './store';
import './styles/app.css';

initStore();
createApp(App).use(router).mount('#app');
