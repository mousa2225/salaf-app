import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️ مهم: غيّر "salaf-app" لاسم الـ repository الذي ستنشئه على GitHub
// مثال: لو الـ repo اسمه "my-advances" خل base يكون: '/my-advances/'
export default defineConfig({
  plugins: [react()],
  base: '/salaf-app/',
})
