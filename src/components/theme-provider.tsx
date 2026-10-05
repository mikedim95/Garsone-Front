"use client"

import { useLayoutEffect, useState } from "react"
import { ThemeProviderProps } from "next-themes/dist/types"
import {
  ThemeContext,
  type ThemeContextType,
  type Theme,
} from "./theme-provider-context"

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  value: _value,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTheme = localStorage.getItem("theme")
        if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system") {
          return savedTheme
        }
      } catch { /* Keep the default usable when browser storage is unavailable. */ }
    }
    return defaultTheme as Theme
  })

  useLayoutEffect(() => {
    const root = window.document.documentElement
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const applyTheme = () => {
      const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme
      root.classList.remove("light", "dark")
      root.classList.add(resolvedTheme)
      root.style.colorScheme = resolvedTheme
    }

    applyTheme()
    if (theme === "system") {
      media.addEventListener("change", applyTheme)
      return () => media.removeEventListener("change", applyTheme)
    }
  }, [theme])

  const value: ThemeContextType = {
    theme,
    setTheme: (theme: Theme) => {
      try {
        localStorage.setItem("theme", theme)
      } catch { /* Theme switching must still work without persistent storage. */ }
      setTheme(theme)
    },
  }

  return (
    <ThemeContext.Provider value={value} {...props}>
      {children}
    </ThemeContext.Provider>
  )
}

export type { Theme } from "./theme-provider-context"
