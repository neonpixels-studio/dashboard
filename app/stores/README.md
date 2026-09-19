# Stores

Pinia stores live here. `@pinia/nuxt` auto-imports them — no manual imports needed.

## Convention

- One store per concern: `useUserStore`, etc.
- Use the **Setup store** syntax (preferred over Options API):

```ts
// app/stores/example.ts
export const useExampleStore = defineStore("example", () => {
  const count = ref(0);

  function increment() {
    count.value++;
  }

  return { count, increment };
});
```

- Access in components/pages:

```ts
const example = useExampleStore();
```
