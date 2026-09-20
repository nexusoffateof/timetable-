import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  test: {
    // Тесты покрывают чистую логику: разницу документов, перевод в строки
    // базы и правила первого входа. Браузерное окружение им не нужно,
    // localStorage там, где он встречается, подменяется в самом тесте.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
