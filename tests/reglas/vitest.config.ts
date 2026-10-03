import { defineConfig } from "vitest/config";

// Pruebas contra los emuladores de Firebase (Auth 9099 + Firestore 8080). Se corren con
// "pnpm test:reglas", que los levanta con "firebase emulators:exec" (requiere Java 21+).
export default defineConfig({
  test: {
    include: ["tests/reglas/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
