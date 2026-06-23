"use client";

import { useEffect, useState } from "react";

type Recipe = {
  id: string;
  name: string;
  prompt: string;
  description: string | null;
};

const DEFAULT_RECIPES = [
  {
    name: "follow-up-email",
    description: "Draft a follow-up email from the conversation",
    prompt:
      "Draft a concise, professional follow-up email based on this conversation. Match the tone of the participants. Include key decisions and next steps.",
  },
  {
    name: "action-items",
    description: "Extract and format action items",
    prompt:
      "List all action items from this conversation. For each: assignee, due date if mentioned, and priority.",
  },
  {
    name: "meeting-summary",
    description: "Executive summary for stakeholders",
    prompt:
      "Write a brief executive summary suitable for sharing with stakeholders who weren't in the conversation.",
  },
];

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const load = () => {
    fetch("/api/recipes")
      .then((r) => r.json())
      .then(setRecipes);
  };

  useEffect(() => {
    load();
  }, []);

  const seedDefaults = async () => {
    for (const r of DEFAULT_RECIPES) {
      await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      });
    }
    load();
  };

  const runRecipe = async (recipeId: string) => {
    if (!sessionId) {
      alert("Enter a session ID first");
      return;
    }
    setRunning(true);
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, recipeId }),
    });
    if (res.ok) {
      const data = await res.json();
      setOutput(data.output);
    }
    setRunning(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Recipes</h1>
          <p className="text-muted text-sm mt-1">
            Reusable prompts — Granola-style /commands for your sessions
          </p>
        </div>
        {recipes.length === 0 && (
          <button
            onClick={seedDefaults}
            className="text-sm px-3 py-1.5 btn-secondary"
          >
            Add defaults
          </button>
        )}
      </div>

      <div className="mb-6">
        <label className="text-sm font-medium">Session ID to run against</label>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Paste session ID from URL"
          className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-md bg-surface font-mono"
        />
      </div>

      <div className="space-y-3 mb-8">
        {recipes.map((recipe) => (
          <div key={recipe.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">/{recipe.name}</h3>
                {recipe.description && (
                  <p className="text-sm text-muted mt-1">{recipe.description}</p>
                )}
              </div>
              <button
                onClick={() => runRecipe(recipe.id)}
                disabled={running}
                className="text-sm px-3 py-1.5 btn-primary rounded-md disabled:opacity-50"
              >
                Run
              </button>
            </div>
          </div>
        ))}
      </div>

      {output && (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-muted mb-2">Output</h2>
          <pre className="text-sm whitespace-pre-wrap">{output}</pre>
        </div>
      )}
    </div>
  );
}
