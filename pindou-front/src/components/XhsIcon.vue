<template>
  <svg
    :class="['xhs-icon', { filled }]"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'like'">
      <path d="M12 20.3C7.4 17.7 3.5 14.4 3.5 10.2c0-2.6 2-4.6 4.6-4.6 1.5 0 2.9.8 3.9 2.1 1-1.3 2.4-2.1 3.9-2.1 2.6 0 4.6 2 4.6 4.6 0 4.2-3.9 7.5-8.5 10.1z"/>
    </template>
    <template v-else-if="name === 'collect'">
      <path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>
    </template>
    <template v-else-if="name === 'comment'">
      <path d="M21 11.5a8.5 8.5 0 0 1-12.9 7.3L4 20l1.3-4.1A8.5 8.5 0 1 1 21 11.5z"/>
    </template>
    <template v-else-if="name === 'share'">
      <path d="M7 17 17 7"/>
      <path d="M7 7 17 7 17 17"/>
    </template>
  </svg>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
  filled: { type: Boolean, default: false },
  size: { type: [Number, String], default: 16 },
})
</script>

<style scoped>
.xhs-icon {
  display: block;
}

.xhs-icon.filled {
  fill: currentColor;
}
</style>
