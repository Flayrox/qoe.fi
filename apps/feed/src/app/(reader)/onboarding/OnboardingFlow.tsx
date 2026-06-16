"use client"

import React from "react"

interface OnboardingFlowProps {
  categories: any[]
  suggestedCreators: any[]
  userId: string
}

export function OnboardingFlow({ categories, suggestedCreators, userId }: OnboardingFlowProps) {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Onboarding</h1>
      <p className="text-sm text-muted-foreground">
        Bienvenue {userId} ! {categories.length} centres d''interet detectes.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        {suggestedCreators.map((c: any) => (
          <div key={c.id} className="p-3 border rounded-lg text-sm">
            {c.name || c.id}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">(Stub)</p>
    </div>
  )
}