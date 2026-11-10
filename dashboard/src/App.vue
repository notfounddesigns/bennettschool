<script setup lang="ts">
import TheLoadingOverlay from './components/TheLoadingOverlay.vue'
import TheSnackbar from './components/TheSnackbar.vue'
</script>

<template>
  <TheLoadingOverlay />
  <TheSnackbar />
  <RouterView />
</template>
