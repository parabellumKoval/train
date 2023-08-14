<script setup>
  const props = defineProps({
    title: {
      type: String
    },
    isActive: {
      type: Boolean,
    },
    dir: {
      type: Boolean,
      default: true
    }
  })

  const emit = defineEmits([
    'sort'
  ])

  const clickHandler = () => {
    emit('sort', props.key)
  }
</script>

<style src="./sort.scss" lang="scss" scoped />

<template>
  <button @click="clickHandler" class="sort-btn">
    <span>{{ props.title }}</span>
    <template v-if="isActive">
      <IconCSS v-if="props.dir" name="ph:sort-ascending" size="18" class="icon-css"></IconCSS>
      <IconCSS v-else name="ph:sort-descending" size="18" class="icon-css"></IconCSS>
    </template>
    <div v-else class="spacer"></div>
  </button>
</template>