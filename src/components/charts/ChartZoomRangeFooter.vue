<script setup>
defineProps({
  start: { type: String, default: '' },
  end: { type: String, default: '' },
})
</script>

<template>
  <div v-if="start || end" class="zoom-range-footer" aria-hidden="true">
    <span class="zoom-range-label">{{ start }}</span>
    <span class="zoom-range-label">{{ end }}</span>
  </div>
</template>

<style scoped>
.zoom-range-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 11px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  pointer-events: none;
  z-index: 2;
}

.zoom-range-label {
  font-size: 11px;
  font-weight: 600;
  color: #f1f5f9;
  text-shadow: 0 0 4px #0f172a, 0 1px 2px #0f172a;
  line-height: 1;
  min-width: 2.8em;
}

.zoom-range-label:last-child {
  text-align: right;
}
</style>
