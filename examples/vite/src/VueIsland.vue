<!-- A Vue island embedding the same <dom-stepper>. Vue treats dashed tags as
     custom elements (configured in vite.config.ts). `:value` is bound to the
     reactive mirror `val` (NOT the constant `start`): it always equals the
     stepper's current state, so the re-apply on each change is a no-op instead of
     fighting it (the earlier `:value="start"` kept forcing the initial value back,
     hence the jumpiness + drift). It also seeds the SSR markup with the value. -->
<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = defineProps<{ start?: number }>();
const val = ref(props.start ?? 0);
const el = ref<HTMLElement | null>(null);

onMounted(() => {
  el.value?.addEventListener("change", (e) => {
    val.value = (e as CustomEvent<number>).detail; // mirror the component's state
  });
});
</script>

<template>
  <div class="card">
    <h3>💚 Vue island</h3>
    <p>Vue state mirrors the Web Component: <b>{{ val }}</b></p>
    <dom-stepper ref="el" :value="val" />
  </div>
</template>
