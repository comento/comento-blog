<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type Heading = {
  id: string;
  level: number;
  title: string;
  children?: Heading[];
};

const props = defineProps<{
  headings: Heading[];
}>();

const headingsByLevel = computed(() => {
  if (!props.headings.length) {
    return [];
  }

  const topLevel: Heading[] = [];
  const current: {
    h2?: Heading;
    h3?: Heading;
  } = {};

  props.headings.forEach((curr) => {
    curr.children = [];

    if (curr.level === 2) {
      topLevel.push(curr);
      current.h2 = curr;
    } else if (curr.level === 3) {
      current.h2.children.push(curr);
      current.h3 = curr;
    }
  });

  return topLevel;
});

const activeHeading = ref({
  level2: headingsByLevel.value[0].id,
  level3: null,
});

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries.find((entry) => entry.isIntersecting);
      if (entry) {
        entry.target.tagName === "H2"
          ? (activeHeading.value.level2 = entry.target.id)
          : (activeHeading.value.level3 = entry.target.id);
      }
    },
    {
      rootMargin: "0px 0px -50% 0px",
    }
  );

  document.querySelectorAll("h2, h3").forEach((heading) => {
    observer.observe(heading);
  });
});
</script>

<template>
  <ol>
    <li
      v-for="{ id, title, children } in headingsByLevel"
      :key="id"
      class="text-gray-400 mb-10"
    >
      <a :href="`#${id}`" :class="{ active: activeHeading.level2 === id }">
        {{ title }}
      </a>
      <ol v-show="activeHeading.level2 === id">
        <li v-for="child in children">
          <a
            :href="`#${child.id}`"
            class="text-body2 ml-5"
            :class="{ active: activeHeading.level3 === child.id }"
          >
            {{ child.title }}
          </a>
        </li>
      </ol>
    </li>
  </ol>
</template>

<style scoped>
a:hover,
.active {
  @apply text-gray-900;
}
</style>
