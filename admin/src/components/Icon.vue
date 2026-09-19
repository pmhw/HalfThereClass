<template>
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'overview'"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></template>
    <template v-else-if="name === 'book'"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 8H20"/></template>
    <template v-else-if="name === 'play'"><circle cx="12" cy="12" r="9"/><path d="M10 9l6 3-6 3z"/></template>
    <template v-else-if="name === 'folder'"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/></template>
    <template v-else-if="name === 'receipt'"><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6"/></template>
    <template v-else-if="name === 'message'"><path d="M5 6h14v10H8l-3 3z"/></template>
    <template v-else-if="name === 'users'"><path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3"/><path d="M20 20v-1.2A3.2 3.2 0 0 0 17.2 16"/><circle cx="17" cy="8.5" r="2.2"/></template>
    <template v-else-if="name === 'chart'"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/></template>
    <template v-else-if="name === 'bell'"><path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15z"/><path d="M10 19a2 2 0 0 0 4 0"/></template>
    <template v-else-if="name === 'cal'"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></template>
    <template v-else-if="name === 'list'"><path d="M8 7h12M8 12h12M8 17h12"/><path d="M4 7h.01M4 12h.01M4 17h.01"/></template>
    <template v-else-if="name === 'chevron'"><path d="M6 9l6 6 6-6"/></template>
    <template v-else-if="name === 'collapse'"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/></template>
    <template v-else-if="name === 'help'"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.8-1.2 1.6V14"/><path d="M12 17h.01"/></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></template>
    <template v-else-if="name === 'layers'"><path d="M12 3l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/></template>
    <template v-else-if="name === 'signal'"><path d="M5 18V14M10 18V10M15 18V7M20 18V4"/></template>
    <template v-else-if="name === 'image'"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="M7 16l3.2-3.2a1 1 0 0 1 1.4 0L16 17"/></template>
    <template v-else-if="name === 'building'"><path d="M4 20V6l8-3 8 3v14"/><path d="M9 20v-4h6v4M9 9h.01M12 9h.01M15 9h.01M9 12h.01M12 12h.01M15 12h.01"/></template>
    <template v-else-if="name === 'pin'"><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2"/></template>
    <template v-else-if="name === 'user'"><circle cx="12" cy="8" r="3"/><path d="M6 19v-1.2A4.8 4.8 0 0 1 10.8 13h2.4A4.8 4.8 0 0 1 18 17.8V19"/></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></template>
    <template v-else-if="name === 'pencil'"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M12 6l4 4"/></template>
    <template v-else-if="name === 'gear'"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></template>
    <template v-else-if="name === 'check'"><path d="M5 12l5 5L20 7"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></template>
  </svg>
</template>

<script setup>
defineProps({ name: String });
</script>
