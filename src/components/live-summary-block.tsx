export function LiveSummaryBlock({ liveSummary }: { liveSummary: string }) {
  return (
    <div className="notes-source-live-summary text-sm leading-relaxed whitespace-pre-wrap">
      {liveSummary.split("\n").map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold text-foreground mt-2 first:mt-0">
              {line.replace(/\*\*/g, "")}
            </p>
          );
        }
        if (line.startsWith("• ") || line.startsWith("- ")) {
          return (
            <p key={i} className="pl-1 text-foreground">
              {line}
            </p>
          );
        }
        if (line.trim() === "") return <br key={i} />;
        return (
          <p key={i} className="text-foreground">
            {line}
          </p>
        );
      })}
    </div>
  );
}
