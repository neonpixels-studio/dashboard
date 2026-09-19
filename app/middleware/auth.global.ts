const PUBLIC_PATHS = ["/", "/login"];

// Strips a trailing slash from anything longer than "/" so "/dashboard/" and
// "/dashboard" are treated as the same route.
function normalizePath(path: string): string {
  return path.replace(/(.)\/$/, "$1");
}

export default defineNuxtRouteMiddleware((to) => {
  const { isSignedIn } = useAuth();
  const path = normalizePath(to.path);

  if (isSignedIn.value && path === "/login") {
    return navigateTo("/dashboard");
  }

  if (!isSignedIn.value && !PUBLIC_PATHS.includes(path)) {
    return navigateTo("/login");
  }
});
