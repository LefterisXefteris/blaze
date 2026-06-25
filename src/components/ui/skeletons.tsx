function SkeletonBar({
  className = "",
  width,
}: {
  className?: string;
  width?: string;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={width ? { width } : undefined}
    />
  );
}

export function NavSkeleton() {
  return (
    <header className="nav-header sticky top-0 z-50 h-14">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <SkeletonBar className="h-10 w-10 rounded-lg" />
          <div className="hidden sm:flex items-center gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBar key={i} className="h-3 w-14" />
            ))}
          </div>
        </div>
        <SkeletonBar className="h-3 w-16" />
      </div>
    </header>
  );
}

export function PageHeaderSkeleton({
  subtitle = true,
}: {
  subtitle?: boolean;
}) {
  return (
    <div className="mb-6">
      <SkeletonBar className="h-7 w-40 mb-2" />
      {subtitle && <SkeletonBar className="h-4 w-64" />}
    </div>
  );
}

export function NotesEditorSkeleton() {
  return (
    <div className="notes-page min-h-[calc(100vh-3.5rem)]">
      <div className="notes-shell notes-shell-with-list">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-header">
            <SkeletonBar className="h-4 w-20" />
            <SkeletonBar className="h-7 w-7 rounded-md" />
          </div>
          <div className="notes-sidebar-scroll p-2 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="notes-sidebar-skeleton">
                <SkeletonBar className="h-4 w-4 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBar className="h-3.5 w-full" />
                  <SkeletonBar className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="notes-layout max-w-3xl mx-auto px-4 py-8 w-full">
          <SkeletonBar className="h-10 w-2/3 mb-6" />
          <div className="card p-4 min-h-[480px] space-y-3">
            <SkeletonBar className="h-4 w-3/4" />
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionViewSkeleton() {
  return (
    <div className="notes-page min-h-[calc(100vh-3.5rem)]">
      <div className="notes-toolbar">
        <div className="notes-toolbar-inner notes-toolbar-inner-wide">
          <SkeletonBar className="h-4 w-16" />
          <SkeletonBar className="h-8 w-32 rounded-md" />
        </div>
      </div>
      <div className="notes-shell notes-shell-with-list notes-shell-with-context">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-header">
            <SkeletonBar className="h-4 w-20" />
          </div>
          <div className="notes-sidebar-scroll p-2 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="notes-sidebar-skeleton">
                <SkeletonBar className="h-4 w-4 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBar className="h-3.5 w-full" />
                  <SkeletonBar className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="notes-layout notes-layout-with-aside">
          <div className="notes-document">
            <SkeletonBar className="h-10 w-2/3 mb-2" />
            <SkeletonBar className="h-4 w-40 mb-6" />
            <SkeletonBar className="h-32 w-full rounded-lg mb-6" />
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-5/6" />
          </div>
          <aside className="notes-aside">
            <div className="notes-aside-inner p-2 space-y-4">
              <SkeletonBar className="h-4 w-24" />
              <SkeletonBar className="h-48 w-full rounded-lg" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHeaderSkeleton subtitle={false} />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center justify-between">
            <div className="space-y-2 flex-1 mr-4">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-3 w-48" />
            </div>
            <SkeletonBar className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecipesSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <PageHeaderSkeleton />
      <SkeletonBar className="h-10 w-full rounded-md mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <SkeletonBar className="h-4 w-36" />
              <SkeletonBar className="h-3 w-56" />
            </div>
            <SkeletonBar className="h-8 w-14 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoteDetailSkeleton() {
  return (
    <div className="notes-page min-h-[calc(100vh-3.5rem)]">
      <div className="notes-toolbar">
        <div className="notes-toolbar-inner notes-toolbar-inner-wide">
          <SkeletonBar className="h-4 w-16" />
          <SkeletonBar className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="notes-shell notes-shell-with-list">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-header">
            <SkeletonBar className="h-4 w-20" />
          </div>
          <div className="notes-sidebar-scroll p-2 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="notes-sidebar-skeleton">
                <SkeletonBar className="h-4 w-4 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBar className="h-3.5 w-full" />
                  <SkeletonBar className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="notes-layout">
          <div className="notes-document">
            <SkeletonBar className="h-10 w-2/3 mb-2" />
            <SkeletonBar className="h-4 w-32 mb-8" />
            <div className="space-y-8">
              <div className="space-y-2">
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="h-4 w-full" />
                <SkeletonBar className="h-4 w-5/6" />
              </div>
              <div className="space-y-2">
                <SkeletonBar className="h-3 w-24" />
                <SkeletonBar className="h-32 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <PageHeaderSkeleton />
      <div className="card p-6 space-y-4">
        <SkeletonBar className="h-4 w-20" />
        <SkeletonBar className="h-10 w-full rounded-md" />
        <SkeletonBar className="h-4 w-24" />
        <SkeletonBar className="h-24 w-full rounded-md" />
        <SkeletonBar className="h-10 w-32 rounded-md mt-4" />
      </div>
    </div>
  );
}

export function InlineSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
      <span className="inline-block h-4 w-4 rounded-full border-2 border-border border-t-primary animate-spin" />
      {label}
    </div>
  );
}
