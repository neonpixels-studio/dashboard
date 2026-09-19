<template>
  <div class="auth">
    <div class="auth-panel">
      <span class="mono auth-brand">dashboard</span>
      <p class="lead auth-lead">Sign in to open your workspace.</p>
      <SignIn fallback-redirect-url="/" />
    </div>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(24px, 6vw, 56px);
  background: var(--bg);
}
.auth-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.auth-brand {
  font-weight: 700;
  font-size: 18px;
}
.auth-lead {
  margin-bottom: 18px;
}
</style>
