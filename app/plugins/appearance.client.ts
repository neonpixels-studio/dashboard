export default defineNuxtPlugin(() => {
  const { initAccent } = useTheme();
  initAccent();
});
